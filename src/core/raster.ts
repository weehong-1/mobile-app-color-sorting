/**
 * A raster is 8-bit RGBA plus the colour space its channels are encoded in.
 * Every pure module in the pipeline takes one of these, so the same code runs
 * against a browser ImageData and against a decoded fixture in Node.
 *
 * 8-bit because that is what a canvas gives us; 16-bit sources are reduced at
 * the loading edge so both environments see identical numbers.
 */
import type { ColorSpace } from './color.ts';

export interface Raster {
  readonly width: number;
  readonly height: number;
  /**
   * RGBA, four bytes per pixel, row-major. Pinned to a plain ArrayBuffer so a
   * raster can be handed straight to ImageData without a copy.
   */
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly space: ColorSpace;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createRaster(width: number, height: number, space: ColorSpace): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4), space };
}

export function pixelIndex(raster: Raster, x: number, y: number): number {
  return (y * raster.width + x) * 4;
}

/**
 * Rec. 709 luma over encoded channels. Deliberately not perceptual: this feeds
 * edge detection, where cheap and stable beats correct.
 */
export function toLuma(raster: Raster): Float32Array {
  const { width, height, data } = raster;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!;
  }
  return out;
}

/**
 * Box-filter downscale by an integer-ish factor. Only ever used to build the
 * working copy for detection (ADR-0001); pixels that reach the output are never
 * resampled.
 */
export function downscale(raster: Raster, targetWidth: number): Raster {
  if (targetWidth >= raster.width) return raster;
  const scale = raster.width / targetWidth;
  const height = Math.max(1, Math.round(raster.height / scale));
  const out = createRaster(targetWidth, height, raster.space);
  const { data, width: sw, height: sh } = raster;

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(sw, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * sw + sx) * 4;
          r += data[p]!; g += data[p + 1]!; b += data[p + 2]!; a += data[p + 3]!;
          n++;
        }
      }
      const q = (y * targetWidth + x) * 4;
      out.data[q] = r / n;
      out.data[q + 1] = g / n;
      out.data[q + 2] = b / n;
      out.data[q + 3] = a / n;
    }
  }
  return out;
}

export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, Math.round(rect.x)));
  const y = Math.max(0, Math.min(height, Math.round(rect.y)));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width - x, Math.round(rect.width))),
    height: Math.max(0, Math.min(height - y, Math.round(rect.height))),
  };
}
