import { describe, expect, it } from 'vitest';
import { createRaster, pixelIndex } from '../core/raster.ts';
import { DEFAULT_SPRITE_OPTIONS, extractSprite } from '../core/sprite.ts';
import { drawSprite, fillRect } from './draw.ts';
import { BADGE_RED, filled, paintRoundedRect } from './synthetic.ts';

const SIZE = 200;
const ICON = { x: 100, y: 100, width: SIZE, height: SIZE };
const BLUE = [40, 120, 220] as const;
const BACKDROP = [255, 0, 255] as const;

function spriteOf(withBadge = false) {
  const raster = filled(500, 500, [200, 198, 188]);
  paintRoundedRect(raster, { ...ICON, radius: SIZE * 0.225 }, BLUE);
  if (withBadge) {
    paintRoundedRect(raster, { x: 100 + SIZE - 44, y: 100 - 32, width: 76, height: 76, radius: 38 }, BADGE_RED);
  }
  return extractSprite(raster, ICON, DEFAULT_SPRITE_OPTIONS);
}

function at(raster: ReturnType<typeof createRaster>, x: number, y: number) {
  const i = pixelIndex(raster, x, y);
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!] as const;
}

function backdrop(width: number, height: number) {
  const raster = createRaster(width, height, 'srgb');
  fillRect(raster, 0, 0, width, height, BACKDROP);
  return raster;
}

describe('drawSprite', () => {
  it('draws the icon where it is told to', () => {
    const sprite = spriteOf();
    const target = backdrop(400, 400);
    drawSprite(target, sprite, 50, 60);

    const centre = at(target, 50 + Math.round(sprite.bounds.width / 2), 60 + Math.round(sprite.bounds.height / 2));
    expect(centre[2]).toBeGreaterThan(centre[0]);
    expect(Math.abs(centre[0] - BLUE[0])).toBeLessThan(12);
  });

  it('leaves the background showing through the rounded corners', () => {
    const sprite = spriteOf();
    const target = backdrop(400, 400);
    drawSprite(target, sprite, 50, 60);

    // The top-left of the bounding box is outside the rounded corner, so the
    // mask is zero there and the backdrop must be untouched.
    expect(at(target, 50, 60)).toEqual([...BACKDROP]);
  });

  it('touches nothing outside the sprite bounds', () => {
    const sprite = spriteOf();
    const target = backdrop(400, 400);
    drawSprite(target, sprite, 50, 60);

    expect(at(target, 49, 60)).toEqual([...BACKDROP]);
    expect(at(target, 50 + sprite.bounds.width, 60)).toEqual([...BACKDROP]);
    expect(at(target, 50, 60 + sprite.bounds.height)).toEqual([...BACKDROP]);
  });

  it('carries the badge overhang with the icon', () => {
    const plain = spriteOf();
    const badged = spriteOf(true);
    expect(badged.badge).not.toBeNull();
    expect(badged.bounds.width).toBeGreaterThan(plain.bounds.width);

    const target = backdrop(400, 400);
    drawSprite(target, badged, 50, 60);

    const badge = badged.badge!;
    const bx = 50 + Math.round(badge.x - badged.bounds.x + badge.width / 2);
    const by = 60 + Math.round(badge.y - badged.bounds.y + badge.height / 2);
    const pixel = at(target, bx, by);
    expect(pixel[0]).toBeGreaterThan(pixel[1] + 60);
    expect(pixel[0]).toBeGreaterThan(pixel[2] + 60);
  });

  it('clips rather than throwing when the sprite runs off the edge', () => {
    const sprite = spriteOf();
    const target = backdrop(120, 120);
    expect(() => drawSprite(target, sprite, 100, 100)).not.toThrow();
    expect(() => drawSprite(target, sprite, -30, -30)).not.toThrow();
  });
});
