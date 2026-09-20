/**
 * Writing rasters out as PNGs, for the debug script only. sharp is a dev
 * dependency and never reaches the bundle; the app writes PNGs through the
 * canvas instead.
 */
import sharp from 'sharp';
import type { Raster } from '../core/raster.ts';

export async function writePng(raster: Raster, path: string, scale = 1): Promise<void> {
  const image = sharp(Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.length), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  });
  const resized =
    scale === 1 ? image : image.resize(Math.round(raster.width * scale), null, { fit: 'inside' });
  await resized.png({ compressionLevel: 6 }).toFile(path);
}
