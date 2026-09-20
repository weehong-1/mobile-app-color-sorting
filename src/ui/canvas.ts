/**
 * The browser edge: decoding an upload into a raster, and turning a raster back
 * into a PNG.
 *
 * Everything between these two functions is pure and shared with the tests. The
 * only real subtlety is colour space. A canvas colour-manages whatever it
 * decodes, so asking for a display-p3 canvas is what keeps a P3 screenshot's
 * pixels intact; where that is unavailable the browser converts to sRGB and the
 * pipeline follows it, which costs a little saturation on the most vivid icons
 * and nothing else.
 */
import type { ColorSpace } from '../core/color.ts';
import { detectPngColorSpace, hasColorProfile } from '../core/png-meta.ts';
import type { Raster } from '../core/raster.ts';

export class UnreadableImageError extends Error {
  constructor() {
    super("This browser can't open that file. Save the screenshot as PNG or JPEG and try again.");
    this.name = 'UnreadableImageError';
  }
}

let p3Support: boolean | null = null;

/** Whether this browser can give us a Display P3 canvas. Cached; harmless to call often. */
export function supportsDisplayP3(): boolean {
  if (p3Support !== null) return p3Support;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { colorSpace: 'display-p3' });
    p3Support = context?.getContextAttributes().colorSpace === 'display-p3';
  } catch {
    p3Support = false;
  }
  return p3Support;
}

function contextFor(width: number, height: number, space: ColorSpace): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context =
    space === 'display-p3'
      ? canvas.getContext('2d', { colorSpace: 'display-p3', willReadFrequently: true })
      : canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new UnreadableImageError();
  return context;
}

export async function decodeImage(file: Blob): Promise<Raster> {
  // The file's own tag tells us what to ask the canvas for; the canvas decides
  // what we actually get.
  let declared: ColorSpace = 'srgb';
  try {
    declared = detectPngColorSpace(new Uint8Array(await file.slice(0, 4096).arrayBuffer()));
  } catch {
    declared = 'srgb';
  }
  const space: ColorSpace = declared === 'display-p3' && supportsDisplayP3() ? 'display-p3' : 'srgb';

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnreadableImageError();
  }

  try {
    const context = contextFor(bitmap.width, bitmap.height, space);
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height, {
      colorSpace: space === 'display-p3' ? 'display-p3' : 'srgb',
    });
    return { width: bitmap.width, height: bitmap.height, data: imageData.data, space };
  } finally {
    bitmap.close();
  }
}

export function rasterToCanvas(raster: Raster): HTMLCanvasElement {
  const context = contextFor(raster.width, raster.height, raster.space);
  const imageData = new ImageData(raster.data, raster.width, raster.height, {
    colorSpace: raster.space === 'display-p3' ? 'display-p3' : 'srgb',
  });
  context.putImageData(imageData, 0, 0);
  return context.canvas;
}

export interface ExportedPng {
  readonly blob: Blob;
  readonly url: string;
  /** False when the browser produced an untagged file we had to fall back on. */
  readonly taggedCorrectly: boolean;
}

/**
 * Exports a PNG, checking that it carries a colour profile rather than trusting
 * the canvas to have tagged it. An untagged Display P3 file is the one outcome
 * that looks plainly broken when shared, so if the check fails we re-export
 * through an sRGB canvas, which is unambiguous everywhere.
 */
export async function exportPng(raster: Raster): Promise<ExportedPng> {
  const blob = await toBlob(rasterToCanvas(raster));
  if (raster.space === 'srgb') {
    return { blob, url: URL.createObjectURL(blob), taggedCorrectly: true };
  }

  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  if (detectPngColorSpace(head) === 'display-p3' || hasColorProfile(head)) {
    return { blob, url: URL.createObjectURL(blob), taggedCorrectly: true };
  }

  const fallback = await toBlob(rasterToCanvas({ ...raster, space: 'srgb' }));
  return { blob: fallback, url: URL.createObjectURL(fallback), taggedCorrectly: false };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new UnreadableImageError())), 'image/png');
  });
}
