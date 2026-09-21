/** Crude overlay drawing for debug images. Test support only. */
import type { Raster } from '../core/raster.ts';
import type { Sprite } from '../core/sprite.ts';

export type Rgb = readonly [number, number, number];

export function clone(raster: Raster): Raster {
  return { ...raster, data: new Uint8ClampedArray(raster.data) };
}

function blend(raster: Raster, x: number, y: number, color: Rgb, alpha: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) return;
  const i = (py * raster.width + px) * 4;
  for (let c = 0; c < 3; c++) {
    raster.data[i + c] = raster.data[i + c]! * (1 - alpha) + color[c]! * alpha;
  }
  // Anything drawn is opaque: these overlays are for looking at, not compositing.
  raster.data[i + 3] = 255;
}

export function drawRect(
  raster: Raster,
  x: number, y: number, w: number, h: number,
  color: Rgb, thickness = 2,
): void {
  for (let t = 0; t < thickness; t++) {
    for (let px = x; px <= x + w; px++) {
      blend(raster, px, y + t, color, 1);
      blend(raster, px, y + h - t, color, 1);
    }
    for (let py = y; py <= y + h; py++) {
      blend(raster, x + t, py, color, 1);
      blend(raster, x + w - t, py, color, 1);
    }
  }
}

export function drawCross(raster: Raster, x: number, y: number, color: Rgb, size = 12): void {
  for (let d = -size; d <= size; d++) {
    blend(raster, x + d, y, color, 1);
    blend(raster, x, y + d, color, 1);
  }
}

export function fillRect(
  raster: Raster,
  x: number, y: number, w: number, h: number,
  color: Rgb, alpha = 1,
): void {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) blend(raster, px, py, color, alpha);
}

/**
 * The grey checkerboard a masked sprite is shown against, so rounded corners
 * and any wallpaper leak are visible. Drawn by the debug sprite sheets and by
 * the second opinion's icon crops, which is why it lives here rather than in
 * either of them.
 */
export function fillCheckerboard(raster: Raster, square = 16): void {
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const dark = (Math.floor(x / square) + Math.floor(y / square)) % 2 === 0;
      fillRect(raster, x, y, 1, 1, dark ? [64, 64, 72] : [96, 96, 104]);
    }
  }
}

/**
 * Composites one sprite onto a background raster, honouring its mask so the
 * rounded corners let the background through, and carrying any badge overhang
 * with it. Anything falling outside the target is clipped.
 *
 * Extracted from the debug sprite sheet because the second opinion of ADR-0012
 * renders single icons the same way, onto a plain background rather than a
 * checkerboard.
 */
export function drawSprite(target: Raster, sprite: Sprite, x: number, y: number): void {
  const { width, height } = sprite.bounds;
  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const alpha = sprite.mask[sy * width + sx]!;
      if (alpha <= 0) continue;
      const from = (sy * width + sx) * 4;
      blend(
        target,
        x + sx,
        y + sy,
        [sprite.pixels[from]!, sprite.pixels[from + 1]!, sprite.pixels[from + 2]!],
        alpha,
      );
    }
  }
}
