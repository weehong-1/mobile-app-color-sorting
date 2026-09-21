/**
 * A PNG reader for fixtures, used only by tests and the debug script.
 *
 * We decode here rather than leaning on an image library because the whole
 * point of ADR-0004 is that these files are Display P3 and must not be silently
 * colour-managed on the way in. This returns exactly the bytes the file stores,
 * reduced from 16-bit to 8-bit the same way a canvas would.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { ColorSpace } from '../core/color.ts';
import { detectPngColorSpace } from '../core/png-meta.ts';
import type { Raster } from '../core/raster.ts';

interface Chunk {
  readonly type: string;
  readonly data: Buffer;
}

function* chunks(buffer: Buffer): Generator<Chunk> {
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    yield { type, data: buffer.subarray(offset + 8, offset + 8 + length) };
    if (type === 'IEND') return;
    offset += 12 + length;
  }
}

function unfilter(raw: Buffer, width: number, height: number, bytesPerPixel: number): Buffer {
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(height * stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++]!;
    const row = raw.subarray(read, read + stride);
    read += stride;
    const here = y * stride;
    const above = here - stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bytesPerPixel ? out[here + i - bytesPerPixel]! : 0;
      const up = y > 0 ? out[above + i]! : 0;
      const upLeft = i >= bytesPerPixel && y > 0 ? out[above + i - bytesPerPixel]! : 0;
      let value = row[i]!;
      switch (filter) {
        case 0: break;
        case 1: value += left; break;
        case 2: value += up; break;
        case 3: value += (left + up) >> 1; break;
        case 4: {
          const estimate = left + up - upLeft;
          const dl = Math.abs(estimate - left);
          const du = Math.abs(estimate - up);
          const dul = Math.abs(estimate - upLeft);
          value += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
          break;
        }
        default: throw new Error(`Unsupported PNG filter type ${filter}`);
      }
      out[here + i] = value & 0xff;
    }
  }
  return out;
}

export function readPng(path: string): Raster {
  const buffer = readFileSync(path);
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error(`Not a PNG: ${path}`);

  const all = [...chunks(buffer)];
  const header = all.find((c) => c.type === 'IHDR');
  if (!header) throw new Error(`PNG has no IHDR: ${path}`);

  const width = header.data.readUInt32BE(0);
  const height = header.data.readUInt32BE(4);
  const bitDepth = header.data[8]!;
  const colorType = header.data[9]!;
  const interlace = header.data[12]!;

  if (interlace !== 0) throw new Error(`Interlaced PNGs are not supported: ${path}`);
  if (bitDepth !== 8 && bitDepth !== 16) {
    throw new Error(`Unsupported bit depth ${bitDepth}: ${path}`);
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!channels) throw new Error(`Unsupported colour type ${colorType}: ${path}`);

  const idat = all.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const bytesPerPixel = channels * (bitDepth / 8);
  const pixels = unfilter(inflateSync(Buffer.concat(idat)), width, height, bytesPerPixel);

  // 16-bit reduces to its high byte, matching what a canvas would hand us.
  const step = bitDepth === 16 ? 2 : 1;
  const stride = width * bytesPerPixel;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = y * stride + x * bytesPerPixel;
      const to = (y * width + x) * 4;
      data[to] = pixels[from]!;
      data[to + 1] = pixels[from + step]!;
      data[to + 2] = pixels[from + 2 * step]!;
      data[to + 3] = channels === 4 ? pixels[from + 3 * step]! : 255;
    }
  }

  const space: ColorSpace = detectPngColorSpace(new Uint8Array(buffer));
  return { width, height, data, space };
}

export const FIXTURES = {
  dense: 'fixtures/IMG_0571.PNG',
  sparse: 'fixtures/IMG_0572.PNG',
  flat: 'fixtures/IMG_0910.PNG',
} as const;
