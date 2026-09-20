/**
 * Cropping one icon out of a screenshot, with its notification badge.
 *
 * A sprite is the icon square plus, when there is one, the badge that overhangs
 * its top-right corner -- so a sprite can be larger than the slot it came from,
 * and it carries the badge's offset with it.
 */
import { type ColorSpace, chroma, oklabToOklch, rgbToOklab } from './color.ts';
import { type RoundedRect, pill, rasterizeMask } from './mask.ts';
import type { Raster, Rect } from './raster.ts';

export interface BadgeOptions {
  /** OKLCH window that iOS badge red falls in, in either colour space. */
  readonly minLightness: number;
  readonly maxLightness: number;
  readonly minChroma: number;
  readonly minHue: number;
  readonly maxHue: number;
  /** Plausible badge sizes, as a fraction of the icon square. */
  readonly minSizeFraction: number;
  readonly maxSizeFraction: number;
}

/**
 * iOS badge red is #FF3B30, which a Display P3 screenshot stores as
 * rgb(235, 75, 70) -- OKLCH lightness 0.653, chroma 0.234, hue 25.6. The same
 * colour converted to sRGB lands close enough that one window covers both,
 * which an RGB threshold would not: the brief's `red > 235` misses the P3
 * value by exactly one.
 *
 * Chroma is what separates a badge from the wallpaper. These screenshots have
 * large blurred warm-orange regions that sit squarely in the badge's hue and
 * lightness range, but blurring costs saturation: across empty slots and
 * gutters the wallpaper peaks at chroma 0.130, against the badge's flat 0.234.
 * The threshold sits between them with room on both sides.
 */
export const DEFAULT_BADGE_OPTIONS: BadgeOptions = {
  minLightness: 0.50,
  maxLightness: 0.80,
  minChroma: 0.17,
  minHue: 10,
  maxHue: 45,
  minSizeFraction: 0.15,
  maxSizeFraction: 0.55,
};

export interface SpriteOptions {
  /** Corner radius as a fraction of the icon square. */
  readonly cornerRadius: number;
  /**
   * Trimmed from each side, as a fraction of the icon square, to keep wallpaper
   * and shadow out of the crop.
   *
   * One pixel is not enough. iOS antialiases an icon's rounded edge over about
   * three pixels at this resolution, and the detected grid can sit a pixel or
   * so off true, so the outermost ring is a blend of icon and wallpaper. On a
   * warm wallpaper that shows as a visible tan rim once the icon is placed on a
   * pale background. Measured on a white tile with no warm content of its own,
   * the rim's chroma falls from 0.176 to 0.002 between a one-pixel and a
   * four-pixel trim. A fraction rather than a pixel count, so it holds at other
   * screenshot resolutions.
   */
  readonly insetFraction: number;
  readonly minInset: number;
  readonly badge: BadgeOptions | null;
}

export const DEFAULT_SPRITE_OPTIONS: SpriteOptions = {
  cornerRadius: 0.225,
  insetFraction: 0.02,
  minInset: 1,
  badge: DEFAULT_BADGE_OPTIONS,
};

/** Pixels trimmed from each side of a slot of the given size. */
export function insetFor(size: number, options: SpriteOptions): number {
  return Math.max(options.minInset, Math.round(size * options.insetFraction));
}

export interface Sprite {
  /** Bounds in screenshot coordinates, including any badge overhang. */
  readonly bounds: Rect;
  /** The masked icon square, in screenshot coordinates. */
  readonly iconRect: Rect;
  /** The badge's bounding box in screenshot coordinates, if it has one. */
  readonly badge: Rect | null;
  readonly pixels: Uint8ClampedArray;
  /** Coverage per pixel of `bounds`, 0 to 1. */
  readonly mask: Float32Array;
  readonly space: ColorSpace;
}

function isBadgeRed(
  raster: Raster,
  x: number,
  y: number,
  options: BadgeOptions,
): boolean {
  const i = (y * raster.width + x) * 4;
  const lab = rgbToOklab(raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!, raster.space);
  if (chroma(lab) < options.minChroma) return false;
  const lch = oklabToOklch(lab);
  return (
    lch.L >= options.minLightness &&
    lch.L <= options.maxLightness &&
    lch.h >= options.minHue &&
    lch.h <= options.maxHue
  );
}

/**
 * Finds a notification badge overhanging the icon's top-right corner.
 *
 * The fill may only start from a pixel strictly outside the icon square, which
 * is what stops a red-tiled app being mistaken for a permanently badged one.
 * It is then allowed to run back inside, because a real badge overlaps the
 * square by about a fifth of its width -- stopping at the boundary would cut
 * the badge in half. The size cap is what makes the red-tile case fail safe: a
 * fill that escapes into the tile produces a box too large to be a badge, and
 * is rejected rather than masked.
 */
export function detectBadge(
  raster: Raster,
  iconRect: Rect,
  options: BadgeOptions = DEFAULT_BADGE_OPTIONS,
): Rect | null {
  const size = iconRect.width;
  const right = iconRect.x + iconRect.width;
  const searchLeft = Math.max(0, Math.round(right - 0.6 * size));
  const searchRight = Math.min(raster.width, Math.round(right + 0.35 * size));
  const searchTop = Math.max(0, Math.round(iconRect.y - 0.45 * size));
  const searchBottom = Math.min(raster.height, Math.round(iconRect.y + 0.6 * size));
  if (searchRight <= searchLeft || searchBottom <= searchTop) return null;

  const outside = (x: number, y: number): boolean => x >= right || y < iconRect.y;

  const spanWidth = searchRight - searchLeft;
  const spanHeight = searchBottom - searchTop;
  const visited = new Uint8Array(spanWidth * spanHeight);
  const stack: number[] = [];

  for (let y = searchTop; y < searchBottom; y++) {
    for (let x = searchLeft; x < searchRight; x++) {
      if (!outside(x, y)) continue;
      if (!isBadgeRed(raster, x, y, options)) continue;
      stack.push(x, y);
    }
  }
  if (stack.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < searchLeft || x >= searchRight || y < searchTop || y >= searchBottom) continue;
    const key = (y - searchTop) * spanWidth + (x - searchLeft);
    if (visited[key]) continue;
    visited[key] = 1;
    if (!isBadgeRed(raster, x, y, options)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  if (maxX < minX) return null;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const min = size * options.minSizeFraction;
  const max = size * options.maxSizeFraction;
  if (width < min || width > max || height < min || height > max) return null;

  return { x: minX, y: minY, width, height };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function extractSprite(
  raster: Raster,
  slot: Rect,
  options: SpriteOptions = DEFAULT_SPRITE_OPTIONS,
): Sprite {
  const inset = insetFor(Math.round(slot.width), options);
  const iconRect: Rect = {
    x: Math.round(slot.x) + inset,
    y: Math.round(slot.y) + inset,
    width: Math.round(slot.width) - 2 * inset,
    height: Math.round(slot.height) - 2 * inset,
  };

  const badge = options.badge ? detectBadge(raster, iconRect, options.badge) : null;
  const bounds = badge ? union(iconRect, badge) : iconRect;

  const shapes: RoundedRect[] = [
    {
      x: iconRect.x - bounds.x,
      y: iconRect.y - bounds.y,
      width: iconRect.width,
      height: iconRect.height,
      radius: iconRect.width * options.cornerRadius,
    },
  ];
  if (badge) {
    shapes.push(pill(badge.x - bounds.x, badge.y - bounds.y, badge.width, badge.height));
  }
  const mask = rasterizeMask(bounds.width, bounds.height, shapes);

  const pixels = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const sourceY = bounds.y + y;
    if (sourceY < 0 || sourceY >= raster.height) continue;
    for (let x = 0; x < bounds.width; x++) {
      const sourceX = bounds.x + x;
      if (sourceX < 0 || sourceX >= raster.width) continue;
      const from = (sourceY * raster.width + sourceX) * 4;
      const to = (y * bounds.width + x) * 4;
      pixels[to] = raster.data[from]!;
      pixels[to + 1] = raster.data[from + 1]!;
      pixels[to + 2] = raster.data[from + 2]!;
      pixels[to + 3] = raster.data[from + 3]!;
    }
  }

  return { bounds, iconRect, badge, pixels, mask, space: raster.space };
}
