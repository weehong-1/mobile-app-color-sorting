/**
 * Edge energy. The wallpaper behind a home screen is heavily blurred, so almost
 * all the gradient in a screenshot comes from icons — which is what makes a
 * projection-based grid search work at all.
 *
 * Values are floored to kill sensor and compression noise, and clipped so that
 * one very high-contrast icon cannot outvote four ordinary ones.
 */
import { type Raster, toLuma } from './raster.ts';

export interface GradientOptions {
  /** Magnitudes below this are treated as zero. */
  readonly floor: number;
  /** Magnitudes above this are treated as this. */
  readonly clip: number;
}

export const DEFAULT_GRADIENT_OPTIONS: GradientOptions = { floor: 6, clip: 40 };

export interface GradientField {
  readonly width: number;
  readonly height: number;
  /** Horizontal magnitude per pixel: evidence of a vertical edge. */
  readonly dx: Float32Array;
  /** Vertical magnitude per pixel: evidence of a horizontal edge. */
  readonly dy: Float32Array;
}

export function gradientField(
  raster: Raster,
  options: GradientOptions = DEFAULT_GRADIENT_OPTIONS,
): GradientField {
  const { width, height } = raster;
  const luma = toLuma(raster);
  const dx = new Float32Array(width * height);
  const dy = new Float32Array(width * height);
  const { floor, clip } = options;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const gx = Math.abs(luma[i + 1]! - luma[i - 1]!);
      const gy = Math.abs(luma[i + width]! - luma[i - width]!);
      dx[i] = gx < floor ? 0 : Math.min(gx, clip);
      dy[i] = gy < floor ? 0 : Math.min(gy, clip);
    }
  }
  return { width, height, dx, dy };
}

/** Sum of horizontal gradient down each column: peaks at vertical icon edges. */
export function columnProjection(field: GradientField): Float64Array {
  const { width, height, dx } = field;
  const out = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) out[x]! += dx[row + x]!;
  }
  return out;
}

export interface Band {
  readonly start: number;
  readonly end: number;
}

/**
 * Sum of vertical gradient across each row, restricted to the horizontal bands
 * the columns occupy. Restricting matters: it keeps the gutters, which contain
 * only wallpaper and app labels, from contributing.
 */
export function rowProjection(field: GradientField, bands: readonly Band[]): Float64Array {
  const { width, height, dy } = field;
  const out = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (const band of bands) {
      const from = Math.max(0, Math.round(band.start));
      const to = Math.min(width, Math.round(band.end));
      for (let x = from; x < to; x++) sum += dy[row + x]!;
    }
    out[y] = sum;
  }
  return out;
}

/**
 * Total magnitude and pixel count inside a rectangle, clipped to the field.
 * Returning the count rather than the mean is what lets `outlineMagnitude`
 * subtract one rectangle from another and still get an honest average when the
 * outer one runs off the edge of the image.
 */
function sumMagnitude(
  field: GradientField,
  x0: number,
  y0: number,
  w: number,
  h: number,
): [sum: number, count: number] {
  const { width, height, dx, dy } = field;
  const left = Math.max(0, Math.round(x0));
  const top = Math.max(0, Math.round(y0));
  const right = Math.min(width, Math.round(x0 + w));
  const bottom = Math.min(height, Math.round(y0 + h));
  if (right <= left || bottom <= top) return [0, 0];

  let sum = 0;
  for (let y = top; y < bottom; y++) {
    const row = y * width;
    for (let x = left; x < right; x++) sum += dx[row + x]! + dy[row + x]!;
  }
  return [sum, (right - left) * (bottom - top)];
}

/** Mean gradient magnitude inside a rectangle. Used to decide if a slot holds an icon. */
export function meanMagnitude(
  field: GradientField,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  const [sum, count] = sumMagnitude(field, x0, y0, w, h);
  return count === 0 ? 0 : sum / count;
}

/**
 * Mean gradient magnitude in the band that straddles a rectangle's edge,
 * reaching `thickness` pixels either side of it. For a slot this is the icon's
 * own outline against the wallpaper, which is the only edge a flat icon has
 * (ADR-0008).
 */
export function outlineMagnitude(
  field: GradientField,
  x0: number,
  y0: number,
  w: number,
  h: number,
  thickness: number,
): number {
  const [outerSum, outerCount] = sumMagnitude(
    field,
    x0 - thickness,
    y0 - thickness,
    w + 2 * thickness,
    h + 2 * thickness,
  );
  const [innerSum, innerCount] = sumMagnitude(
    field,
    x0 + thickness,
    y0 + thickness,
    w - 2 * thickness,
    h - 2 * thickness,
  );
  const count = outerCount - innerCount;
  return count <= 0 ? 0 : (outerSum - innerSum) / count;
}
