/**
 * Lifting the app name out from under an icon.
 *
 * The labels are white text drawn over a blurred wallpaper, so there is no
 * matte to recover -- only the text's effect on whatever was behind it. We
 * estimate that background per block, solve for how much white was laid over
 * it, and keep the result as an alpha channel that can be redrawn in any
 * colour.
 *
 * Solving per channel and taking the minimum is what rejects everything that
 * is not white text: a coloured mark such as the blue "new app" dot raises one
 * channel far more than the others, so its minimum stays near zero, and a
 * shadow lowers all three rather than raising them.
 *
 * What survives all three of those is the wallpaper's own bright edges, which
 * lift every channel at once. Those are rejected afterwards, by how far they
 * get rather than by what colour they are: see `keepSolidRegions`.
 */
import type { Raster, Rect } from './raster.ts';

export interface LabelOptions {
  /** Strip position and size, as fractions of the icon square. */
  readonly gap: number;
  readonly height: number;
  readonly sidePadding: number;
  /** Background is a per-channel median over blocks of this many pixels. */
  readonly blockSize: number;
  /** Soft threshold applied to the recovered alpha. */
  readonly softFloor: number;
  readonly softCeiling: number;
  /** A region of lit pixels is text only if it reaches this alpha somewhere. */
  readonly minPeak: number;
  /** Below this share of lit pixels we treat the strip as having no label. */
  readonly minCoverage: number;
}

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  gap: 0.04,
  height: 0.34,
  sidePadding: 0.2,
  blockSize: 16,
  softFloor: 0.22,
  softCeiling: 0.62,
  minPeak: 0.9,
  minCoverage: 0.004,
};

/** Alpha above which a pixel counts as having text in it. */
const LIT = 0.05;

export interface Label {
  /** Where the strip was taken from, in screenshot coordinates. */
  readonly bounds: Rect;
  /** Offset of the strip from its icon square's top-left corner. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Recovered text coverage per pixel, 0 to 1. */
  readonly alpha: Float32Array;
  /** Share of pixels with any text in them. */
  readonly coverage: number;
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1] ?? 0;
}

/**
 * Per-channel background estimate: a median per block, then bilinear
 * interpolation between block centres so the estimate varies as smoothly as the
 * blurred wallpaper it is approximating.
 */
function estimateBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number,
): Float32Array {
  const blocksX = Math.max(1, Math.ceil(width / blockSize));
  const blocksY = Math.max(1, Math.ceil(height / blockSize));
  const coarse = new Float32Array(blocksX * blocksY * 3);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const channels: number[][] = [[], [], []];
      const x1 = Math.min(width, (bx + 1) * blockSize);
      const y1 = Math.min(height, (by + 1) * blockSize);
      for (let y = by * blockSize; y < y1; y++) {
        for (let x = bx * blockSize; x < x1; x++) {
          const i = (y * width + x) * 4;
          channels[0]!.push(pixels[i]!);
          channels[1]!.push(pixels[i + 1]!);
          channels[2]!.push(pixels[i + 2]!);
        }
      }
      for (let c = 0; c < 3; c++) coarse[(by * blocksX + bx) * 3 + c] = median(channels[c]!);
    }
  }

  const fine = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(blocksY - 1, Math.max(0, y / blockSize - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(blocksY - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(blocksX - 1, Math.max(0, x / blockSize - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(blocksX - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const a = coarse[(y0 * blocksX + x0) * 3 + c]!;
        const b = coarse[(y0 * blocksX + x1) * 3 + c]!;
        const d = coarse[(y1 * blocksX + x0) * 3 + c]!;
        const e = coarse[(y1 * blocksX + x1) * 3 + c]!;
        fine[(y * width + x) * 3 + c] =
          (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }
    }
  }
  return fine;
}

/**
 * Erases connected regions of lit pixels that never reach full strength.
 *
 * White text recovers to 1 at the centre of every stroke whatever is behind
 * it, because the solve is normalised by the headroom the background left. A
 * bright edge in the wallpaper does not: it lifts all three channels part of
 * the way and stops there, which is why taking the per-channel minimum cannot
 * reject it. Across the three fixtures, 382 of 386 recovered regions peak at
 * 1.00; the four that do not peak at 0.49 or below, and every one of them is
 * wallpaper -- IMG_0910 has a bright diagonal running through several strips.
 *
 * Whole regions go or stay, so a glyph keeps its soft edges.
 */
function keepSolidRegions(
  alpha: Float32Array,
  width: number,
  height: number,
  minPeak: number,
): void {
  const seen = new Uint8Array(alpha.length);
  const region: number[] = [];
  const stack: number[] = [];
  const visit = (at: number): void => {
    if (seen[at] || alpha[at]! <= LIT) return;
    seen[at] = 1;
    stack.push(at);
  };

  for (let start = 0; start < alpha.length; start++) {
    if (seen[start] || alpha[start]! <= LIT) continue;

    region.length = 0;
    stack.length = 0;
    visit(start);
    let peak = 0;

    while (stack.length > 0) {
      const at = stack.pop()!;
      region.push(at);
      peak = Math.max(peak, alpha[at]!);
      const x = at % width;
      const y = (at - x) / width;
      if (x > 0) visit(at - 1);
      if (x < width - 1) visit(at + 1);
      if (y > 0) visit(at - width);
      if (y < height - 1) visit(at + width);
    }

    if (peak < minPeak) for (const at of region) alpha[at] = 0;
  }
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function extractLabel(
  raster: Raster,
  iconRect: Rect,
  options: LabelOptions = DEFAULT_LABEL_OPTIONS,
): Label | null {
  const size = iconRect.width;
  const left = Math.round(iconRect.x - size * options.sidePadding);
  const top = Math.round(iconRect.y + iconRect.height + size * options.gap);
  const width = Math.round(size * (1 + 2 * options.sidePadding));
  const height = Math.round(size * options.height);
  if (top + height > raster.height || width <= 0 || height <= 0) return null;

  const clampedLeft = Math.max(0, left);
  const clampedWidth = Math.min(raster.width - clampedLeft, width);
  if (clampedWidth <= 0) return null;

  const strip = new Uint8ClampedArray(clampedWidth * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < clampedWidth; x++) {
      const from = ((top + y) * raster.width + (clampedLeft + x)) * 4;
      const to = (y * clampedWidth + x) * 4;
      strip[to] = raster.data[from]!;
      strip[to + 1] = raster.data[from + 1]!;
      strip[to + 2] = raster.data[from + 2]!;
      strip[to + 3] = 255;
    }
  }

  const background = estimateBackground(strip, clampedWidth, height, options.blockSize);
  const alpha = new Float32Array(clampedWidth * height);
  for (let i = 0; i < alpha.length; i++) {
    let smallest = 1;
    for (let c = 0; c < 3; c++) {
      const base = background[i * 3 + c]!;
      const headroom = 255 - base;
      const value = headroom <= 1 ? 0 : (strip[i * 4 + c]! - base) / headroom;
      smallest = Math.min(smallest, value);
    }
    alpha[i] = smoothStep(options.softFloor, options.softCeiling, smallest);
  }
  keepSolidRegions(alpha, clampedWidth, height, options.minPeak);

  let lit = 0;
  for (const value of alpha) if (value > LIT) lit++;
  const coverage = lit / alpha.length;
  if (coverage < options.minCoverage) return null;

  return {
    bounds: { x: clampedLeft, y: top, width: clampedWidth, height },
    offsetX: clampedLeft - iconRect.x,
    offsetY: top - iconRect.y,
    alpha,
    coverage,
  };
}
