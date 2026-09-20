/**
 * Coverage masks, rasterised by signed distance.
 *
 * The app has a canvas available, but composition does not use it (ADR-0002),
 * so shapes are rasterised here and the same code runs under Vitest. Coverage
 * comes from the distance to the shape rather than from supersampling: it is
 * exact for these shapes, cheaper, and gives a smooth edge at any size.
 */

export interface RoundedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

/** A pill is a rounded rect whose radius is half its shorter side. */
export function pill(x: number, y: number, width: number, height: number): RoundedRect {
  return { x, y, width, height, radius: Math.min(width, height) / 2 };
}

/** Signed distance from a point to a rounded rectangle. Negative inside. */
export function signedDistance(shape: RoundedRect, px: number, py: number): number {
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const radius = Math.max(0, Math.min(shape.radius, Math.min(halfWidth, halfHeight)));
  const dx = Math.abs(px - (shape.x + halfWidth)) - (halfWidth - radius);
  const dy = Math.abs(py - (shape.y + halfHeight)) - (halfHeight - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/** Coverage of one pixel, 0 outside to 1 inside, antialiased across the edge. */
export function coverage(shape: RoundedRect, px: number, py: number): number {
  const d = signedDistance(shape, px + 0.5, py + 0.5);
  return Math.max(0, Math.min(1, 0.5 - d));
}

/**
 * Union of shapes as a coverage mask, in a buffer of `width` by `height`.
 * Coordinates are relative to the buffer's origin.
 */
export function rasterizeMask(
  width: number,
  height: number,
  shapes: readonly RoundedRect[],
): Float32Array {
  const mask = new Float32Array(width * height);
  for (const shape of shapes) {
    const from = {
      x: Math.max(0, Math.floor(shape.x - 1)),
      y: Math.max(0, Math.floor(shape.y - 1)),
    };
    const to = {
      x: Math.min(width, Math.ceil(shape.x + shape.width + 1)),
      y: Math.min(height, Math.ceil(shape.y + shape.height + 1)),
    };
    for (let y = from.y; y < to.y; y++) {
      const row = y * width;
      for (let x = from.x; x < to.x; x++) {
        const value = coverage(shape, x, y);
        if (value > mask[row + x]!) mask[row + x] = value;
      }
    }
  }
  return mask;
}
