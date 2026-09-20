import { describe, expect, it } from 'vitest';
import { gradientField } from './gradient.ts';
import { DEFAULT_DETECT_OPTIONS, detectGrid, slotRect } from './grid.ts';
import { pill } from './mask.ts';
import type { Rect } from './raster.ts';
import { DEFAULT_BADGE_OPTIONS, DEFAULT_SPRITE_OPTIONS, detectBadge, extractSprite, insetFor } from './sprite.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import { BADGE_RED, filled, paintRoundedRect } from '../test-support/synthetic.ts';
import truthDense from '../../fixtures/IMG_0571.truth.json' with { type: 'json' };

const SIZE = 200;
const WALLPAPER = [200, 198, 188] as const;

function scene(tile: readonly [number, number, number], badge: boolean) {
  const raster = filled(500, 500, WALLPAPER);
  const iconRect: Rect = { x: 100, y: 100, width: SIZE, height: SIZE };
  paintRoundedRect(raster, { ...iconRect, radius: SIZE * 0.225 }, tile);
  if (badge) {
    const box = { x: 100 + SIZE - 44, y: 100 - 32, width: 76, height: 76 };
    paintRoundedRect(raster, { ...box, radius: 38 }, BADGE_RED);
  }
  return { raster, iconRect };
}

describe('extractSprite on a synthetic icon', () => {
  const { raster, iconRect } = scene([20, 110, 200], false);
  const sprite = extractSprite(raster, iconRect, { ...DEFAULT_SPRITE_OPTIONS, badge: null });

  it('is exactly the inset icon square when there is no badge', () => {
    const inset = insetFor(SIZE, DEFAULT_SPRITE_OPTIONS);
    expect(sprite.bounds).toEqual({
      x: iconRect.x + inset, y: iconRect.y + inset,
      width: SIZE - 2 * inset, height: SIZE - 2 * inset,
    });
    expect(sprite.badge).toBeNull();
  });

  it('masks the corners off and leaves the middle fully on', () => {
    const { width, height } = sprite.bounds;
    expect(sprite.mask[(height >> 1) * width + (width >> 1)]).toBe(1);
    expect(sprite.mask[0]).toBe(0);
    expect(sprite.mask[width - 1]).toBe(0);
    expect(sprite.mask[(height - 1) * width]).toBe(0);
  });

  it('copies source pixels unchanged inside the mask', () => {
    const { width, height } = sprite.bounds;
    for (const [x, y] of [[width >> 1, height >> 1], [width >> 2, height >> 2]] as const) {
      const from = ((sprite.bounds.y + y) * raster.width + (sprite.bounds.x + x)) * 4;
      const to = (y * width + x) * 4;
      expect([sprite.pixels[to], sprite.pixels[to + 1], sprite.pixels[to + 2]])
        .toEqual([raster.data[from], raster.data[from + 1], raster.data[from + 2]]);
    }
  });

  it('insets so the outermost source ring never reaches the sprite', () => {
    expect(sprite.bounds.x).toBeGreaterThan(iconRect.x);
    expect(sprite.bounds.width).toBeLessThan(iconRect.width);
  });
});

describe('detectBadge', () => {
  it('finds a badge overhanging the corner', () => {
    const { raster, iconRect } = scene([40, 190, 90], true);
    const badge = detectBadge(raster, iconRect);
    expect(badge).not.toBeNull();
    expect(badge!.width).toBeGreaterThan(SIZE * 0.3);
    expect(badge!.width).toBeLessThan(SIZE * 0.45);
    expect(badge!.x + badge!.width).toBeGreaterThan(iconRect.x + iconRect.width);
    expect(badge!.y).toBeLessThan(iconRect.y);
  });

  it('finds nothing on an icon without one', () => {
    const { raster, iconRect } = scene([40, 190, 90], false);
    expect(detectBadge(raster, iconRect)).toBeNull();
  });

  /** A red tile has no badge, and its own colour must not become one. */
  it('ignores a red tile with no badge', () => {
    const { raster, iconRect } = scene(BADGE_RED, false);
    expect(detectBadge(raster, iconRect)).toBeNull();
  });

  /**
   * The fail-safe: on a red tile WITH a badge the fill escapes into the tile,
   * so the region is too big to be a badge and is rejected. Losing the badge is
   * the acceptable outcome; masking a pill over the whole icon is not.
   */
  it('rejects a region that escapes into a same-coloured tile', () => {
    const { raster, iconRect } = scene(BADGE_RED, true);
    const badge = detectBadge(raster, iconRect);
    if (badge !== null) {
      expect(badge.width).toBeLessThanOrEqual(SIZE * DEFAULT_BADGE_OPTIONS.maxSizeFraction);
    }
  });

  it('does not mistake blurred warm wallpaper for a badge', () => {
    // Wallpaper hue and lightness, but the lower chroma that blurring causes.
    const { raster, iconRect } = scene([40, 190, 90], false);
    paintRoundedRect(raster, { x: 280, y: 60, width: 120, height: 120, radius: 60 }, [214, 150, 120]);
    expect(detectBadge(raster, iconRect)).toBeNull();
  });
});

describe('sprites from the dense fixture', () => {
  const raster = readPng(FIXTURES.dense);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);
  const byName = new Map(
    detection.occupied.map((slot, index) => {
      const rect = slotRect(detection.grid, slot);
      const sprite = extractSprite(
        raster,
        { x: rect.start, y: rect.top, width: detection.grid.size, height: detection.grid.size },
        DEFAULT_SPRITE_OPTIONS,
      );
      return [truthDense.icons[index]!.name, sprite] as const;
    }),
  );

  it('finds badges on Gmail and WhatsApp and nowhere else', () => {
    const badged = [...byName].filter(([, sprite]) => sprite.badge).map(([name]) => name).sort();
    expect(badged).toEqual(['Gmail', 'WhatsApp']);
  });

  it.each(['Gmail', 'WhatsApp'])('carries %s\'s badge in its sprite', (name) => {
    const sprite = byName.get(name)!;
    const badge = sprite.badge!;
    const iconRight = sprite.iconRect.x + sprite.iconRect.width;

    // It overhangs, so the sprite has to be bigger than the icon square.
    expect(badge.x + badge.width).toBeGreaterThan(iconRight);
    expect(badge.y).toBeLessThan(sprite.iconRect.y);
    expect(sprite.bounds.width).toBeGreaterThan(sprite.iconRect.width);
    expect(sprite.bounds.height).toBeGreaterThan(sprite.iconRect.height);

    // And it is a plausible badge: iOS draws these at about 38% of icon width.
    expect(badge.width / sprite.iconRect.width).toBeGreaterThan(0.3);
    expect(badge.width / sprite.iconRect.width).toBeLessThan(0.45);
  });

  it.each(['Gmail', 'WhatsApp'])('masks %s\'s badge in, so it survives compositing', (name) => {
    const sprite = byName.get(name)!;
    const badge = sprite.badge!;
    const centreX = Math.round(badge.x + badge.width / 2 - sprite.bounds.x);
    const centreY = Math.round(badge.y + badge.height / 2 - sprite.bounds.y);
    expect(sprite.mask[centreY * sprite.bounds.width + centreX]).toBe(1);

    // The pill covers the whole badge box, numeral included.
    const shape = pill(badge.x - sprite.bounds.x, badge.y - sprite.bounds.y, badge.width, badge.height);
    expect(shape.radius).toBeCloseTo(Math.min(badge.width, badge.height) / 2, 6);
  });

  it('keeps every other sprite exactly one inset icon square', () => {
    const inset = insetFor(detection.grid.size, DEFAULT_SPRITE_OPTIONS);
    for (const [name, sprite] of byName) {
      if (sprite.badge) continue;
      expect(sprite.bounds.width, name).toBe(detection.grid.size - 2 * inset);
      expect(sprite.bounds.height, name).toBe(detection.grid.size - 2 * inset);
    }
  });
});

describe('sprites from the sparse fixture', () => {
  const raster = readPng(FIXTURES.sparse);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);

  /** Todoist is a red tile, and the small pink dot on the last icon is not a badge. */
  it('finds no badges at all', () => {
    for (const slot of detection.occupied) {
      const rect = slotRect(detection.grid, slot);
      const sprite = extractSprite(
        raster,
        { x: rect.start, y: rect.top, width: detection.grid.size, height: detection.grid.size },
        DEFAULT_SPRITE_OPTIONS,
      );
      expect(sprite.badge, `slot ${slot.column},${slot.row}`).toBeNull();
    }
  });
});
