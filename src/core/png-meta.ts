/**
 * Just enough PNG chunk reading to answer one question: what colour space is
 * this file in? Used on the way in, to decide how to read a screenshot, and on
 * the way out, to check that an exported PNG really carries the profile it
 * needs (an untagged Display P3 file looks washed out everywhere).
 */
import type { ColorSpace } from './color.ts';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export interface PngChunk {
  readonly type: string;
  readonly start: number;
  readonly length: number;
}

export function* pngChunks(bytes: Uint8Array): Generator<PngChunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    let type = '';
    for (let i = 0; i < 4; i++) type += String.fromCharCode(bytes[offset + 4 + i]!);
    yield { type, start: offset + 8, length };
    if (type === 'IEND') return;
    offset += 12 + length;
  }
}

/**
 * Display P3 is signalled either by a cICP chunk with primaries 12 (P3-D65) or
 * by Apple's ICC profile name. Anything else we treat as sRGB.
 */
export function detectPngColorSpace(bytes: Uint8Array): ColorSpace {
  if (!isPng(bytes)) return 'srgb';
  for (const chunk of pngChunks(bytes)) {
    if (chunk.type === 'cICP' && bytes[chunk.start] === 12) return 'display-p3';
    if (chunk.type === 'iCCP') {
      let name = '';
      for (let i = 0; i < Math.min(chunk.length, 80); i++) {
        const byte = bytes[chunk.start + i]!;
        if (byte === 0) break;
        name += String.fromCharCode(byte);
      }
      if (name.includes('DisplayP3') || name.includes('Display P3')) return 'display-p3';
    }
  }
  return 'srgb';
}

/** True when the PNG carries a colour profile at all. */
export function hasColorProfile(bytes: Uint8Array): boolean {
  if (!isPng(bytes)) return false;
  for (const chunk of pngChunks(bytes)) {
    if (chunk.type === 'cICP' || chunk.type === 'iCCP' || chunk.type === 'sRGB') return true;
  }
  return false;
}
