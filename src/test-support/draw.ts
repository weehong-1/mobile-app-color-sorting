/** Crude overlay drawing for debug images. Test support only. */
import type { Raster } from '../core/raster.ts';

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
