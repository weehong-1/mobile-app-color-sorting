/** Builders for synthetic rasters, so pure logic can be tested without a screenshot. */
import type { ColorSpace } from '../core/color.ts';
import { coverage } from '../core/mask.ts';
import { type Raster, createRaster } from '../core/raster.ts';

export type Rgb = readonly [number, number, number];

export function filled(
  width: number,
  height: number,
  color: Rgb,
  space: ColorSpace = 'display-p3',
): Raster {
  const raster = createRaster(width, height, space);
  for (let i = 0; i < width * height; i++) {
    raster.data[i * 4] = color[0];
    raster.data[i * 4 + 1] = color[1];
    raster.data[i * 4 + 2] = color[2];
    raster.data[i * 4 + 3] = 255;
  }
  return raster;
}

export function paintRoundedRect(
  raster: Raster,
  rect: { x: number; y: number; width: number; height: number; radius: number },
  color: Rgb,
): void {
  for (let y = Math.floor(rect.y); y < Math.ceil(rect.y + rect.height); y++) {
    for (let x = Math.floor(rect.x); x < Math.ceil(rect.x + rect.width); x++) {
      if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) continue;
      const alpha = coverage(rect, x, y);
      if (alpha <= 0) continue;
      const i = (y * raster.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        raster.data[i + c] = raster.data[i + c]! * (1 - alpha) + color[c]! * alpha;
      }
    }
  }
}

/** iOS badge red as a Display P3 screenshot stores it. */
export const BADGE_RED: Rgb = [235, 75, 70];
