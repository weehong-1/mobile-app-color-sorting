import { describe, expect, it } from 'vitest';
import { convertRgb, hexToRgb } from './color.ts';
import { compose } from './compose.ts';
import {
  DEFAULT_PIPELINE_OPTIONS,
  analyseScreenshot,
  composeSorted,
  planLabels,
  planLayout,
} from './pipeline.ts';
import { DEFAULT_SPRITE_OPTIONS, extractSprite } from './sprite.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import { filled, paintRoundedRect } from '../test-support/synthetic.ts';
import truthSparse from '../../fixtures/IMG_0572.truth.json' with { type: 'json' };

const BACKGROUND = [18, 18, 20] as const;

describe('compose', () => {
  const source = filled(400, 400, [200, 198, 188]);
  paintRoundedRect(source, { x: 100, y: 100, width: 200, height: 200, radius: 45 }, [40, 120, 220]);
  const sprite = extractSprite(source, { x: 100, y: 100, width: 200, height: 200 }, DEFAULT_SPRITE_OPTIONS);

  it('produces a canvas of exactly the size asked for', () => {
    const output = compose({ width: 321, height: 654, space: 'display-p3', background: BACKGROUND }, []);
    expect(output.width).toBe(321);
    expect(output.height).toBe(654);
    expect(output.data).toHaveLength(321 * 654 * 4);
  });

  it('fills every pixel with the background when nothing is drawn', () => {
    const output = compose({ width: 16, height: 16, space: 'display-p3', background: BACKGROUND }, []);
    for (let i = 0; i < 16 * 16; i++) {
      expect([output.data[i * 4], output.data[i * 4 + 1], output.data[i * 4 + 2], output.data[i * 4 + 3]])
        .toEqual([...BACKGROUND, 255]);
    }
  });

  it('leaves the result fully opaque', () => {
    const output = compose(
      { width: 400, height: 400, space: 'display-p3', background: BACKGROUND },
      [{ sprite, iconX: 50, iconY: 50 }],
    );
    for (let i = 3; i < output.data.length; i += 4) expect(output.data[i]).toBe(255);
  });

  it('copies source pixels exactly where the mask is fully on', () => {
    const output = compose(
      { width: 400, height: 400, space: 'display-p3', background: BACKGROUND },
      [{ sprite, iconX: 50, iconY: 50 }],
    );
    const dx = 50 + (sprite.bounds.x - sprite.iconRect.x);
    const dy = 50 + (sprite.bounds.y - sprite.iconRect.y);
    let checked = 0;
    for (let y = 0; y < sprite.bounds.height; y++) {
      for (let x = 0; x < sprite.bounds.width; x++) {
        if (sprite.mask[y * sprite.bounds.width + x] !== 1) continue;
        const from = (y * sprite.bounds.width + x) * 4;
        const to = ((dy + y) * output.width + (dx + x)) * 4;
        expect(output.data[to]).toBe(sprite.pixels[from]);
        expect(output.data[to + 1]).toBe(sprite.pixels[from + 1]);
        expect(output.data[to + 2]).toBe(sprite.pixels[from + 2]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it('blends between background and source across the mask edge', () => {
    const output = compose(
      { width: 400, height: 400, space: 'display-p3', background: BACKGROUND },
      [{ sprite, iconX: 50, iconY: 50 }],
    );
    // A corner pixel of the bounding box is outside the rounded mask entirely.
    const dx = 50 + (sprite.bounds.x - sprite.iconRect.x);
    const dy = 50 + (sprite.bounds.y - sprite.iconRect.y);
    const corner = (dy * output.width + dx) * 4;
    expect([output.data[corner], output.data[corner + 1], output.data[corner + 2]]).toEqual([...BACKGROUND]);
  });

  it('clips a sprite that hangs off the canvas instead of wrapping or throwing', () => {
    const output = compose(
      { width: 120, height: 120, space: 'display-p3', background: BACKGROUND },
      [{ sprite, iconX: 60, iconY: 60 }],
    );
    expect(output.data).toHaveLength(120 * 120 * 4);
    // Above and left of the sprite is untouched, so nothing wrapped around.
    expect([output.data[0], output.data[1], output.data[2]]).toEqual([...BACKGROUND]);
    // Inside the visible part, the sprite really was drawn.
    const inside = ((100 * 120) + 100) * 4;
    expect([output.data[inside], output.data[inside + 1], output.data[inside + 2]])
      .not.toEqual([...BACKGROUND]);
  });

  it('draws a sprite whose origin is off the top-left without wrapping', () => {
    const output = compose(
      { width: 120, height: 120, space: 'display-p3', background: BACKGROUND },
      [{ sprite, iconX: -80, iconY: -80 }],
    );
    // The bottom-right is beyond the sprite's reach, so still background.
    const far = ((119 * 120) + 119) * 4;
    expect([output.data[far], output.data[far + 1], output.data[far + 2]]).toEqual([...BACKGROUND]);
  });
});

const ORIGINAL_LAYOUT = { ...DEFAULT_PIPELINE_OPTIONS, layout: 'original' as const };

describe('composeSorted on the sparse fixture', () => {
  const raster = readPng(FIXTURES.sparse);
  const analysed = analyseScreenshot(raster, ORIGINAL_LAYOUT);
  const background = convertRgb(hexToRgb('#f2f2f7'), 'srgb', raster.space);
  const output = composeSorted(raster, analysed, { background });

  it('matches the input dimensions', () => {
    expect(output.width).toBe(raster.width);
    expect(output.height).toBe(raster.height);
    expect(output.space).toBe(raster.space);
  });

  /** Icon pixels come from the screenshot, not from a redrawn approximation. */
  it('reproduces the source pixels byte for byte inside every mask', () => {
    const placements = planLayout(analysed);
    let checked = 0;
    for (const placement of placements) {
      const { sprite } = placement;
      const dx = Math.round(placement.iconX + (sprite.bounds.x - sprite.iconRect.x));
      const dy = Math.round(placement.iconY + (sprite.bounds.y - sprite.iconRect.y));
      for (let y = 0; y < sprite.bounds.height; y += 3) {
        for (let x = 0; x < sprite.bounds.width; x += 3) {
          if (sprite.mask[y * sprite.bounds.width + x] !== 1) continue;
          const source = ((sprite.bounds.y + y) * raster.width + (sprite.bounds.x + x)) * 4;
          const dest = ((dy + y) * output.width + (dx + x)) * 4;
          expect(output.data[dest]).toBe(raster.data[source]);
          expect(output.data[dest + 1]).toBe(raster.data[source + 1]);
          expect(output.data[dest + 2]).toBe(raster.data[source + 2]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  /** The page keeps its shape: three empty rows in the middle stay empty. */
  it('keeps the originally occupied slots and leaves the gaps alone', () => {
    const occupied = new Set(truthSparse.icons.map((icon) => `${icon.column},${icon.row}`));
    const placements = planLayout(analysed);
    expect(placements).toHaveLength(truthSparse.icons.length);

    const used = new Set(
      placements.map((placement) => {
        const slot = analysed.icons.find(
          (icon) => Math.abs(icon.sprite.iconRect.x - placement.iconX) < 1
            && Math.abs(icon.sprite.iconRect.y - placement.iconY) < 1,
        );
        return `${slot!.slot.column},${slot!.slot.row}`;
      }),
    );
    expect([...used].sort()).toEqual([...occupied].sort());
  });

  /**
   * Icons and labels must read the same arrangement. They are planned by
   * separate functions, so a change to one and not the other silently puts
   * every label under the wrong icon.
   */
  it('places each label with the icon it belongs to, in every layout', () => {
    for (const layout of ['packed', 'original', 'within-rows'] as const) {
      const laidOut = analyseScreenshot(raster, { ...DEFAULT_PIPELINE_OPTIONS, layout });
      const placements = planLayout(laidOut);
      const labels = planLabels(laidOut, [0, 0, 0]);
      expect(labels.length, layout).toBe(laidOut.icons.filter((icon) => icon.label).length);

      for (const label of labels) {
        // Every label sits directly beneath exactly one placed icon.
        const owner = placements.find(
          (placement) =>
            Math.abs(placement.iconX + label.label.offsetX - label.x) < 1 &&
            Math.abs(placement.iconY + label.label.offsetY - label.y) < 1,
        );
        expect(owner, `${layout}: label at ${label.x},${label.y} has no icon above it`).toBeDefined();
      }
    }
  });

  it('packs into a solid block when asked to', () => {
    const packed = analyseScreenshot(raster, { ...DEFAULT_PIPELINE_OPTIONS, layout: 'packed' });
    const placements = planLayout(packed);
    const columns = packed.grid.columns;

    // Destinations are the first N slots in reading order, and no others.
    const expected = placements.map((_, position) => ({
      column: position % columns,
      row: Math.floor(position / columns),
    }));
    placements.forEach((placement, position) => {
      const want = expected[position]!;
      const inset = packed.icons[0]!.sprite.iconRect.x - packed.icons[0]!.rect.x;
      expect(placement.iconX).toBeCloseTo(packed.grid.left + want.column * packed.grid.columnPitch + inset, 0);
      expect(placement.iconY).toBeCloseTo(packed.grid.top + want.row * packed.grid.rowPitch + inset, 0);
    });

    // The sparse fixture's three empty middle rows are gone.
    const rows = new Set(expected.map((slot) => slot.row));
    expect([...rows].sort()).toEqual([0, 1]);
  });

  it('leaves the chrome regions as flat background', () => {
    // The dock sits below the grid and is never reproduced.
    const y = Math.round(raster.height * 0.93);
    for (let x = 0; x < raster.width; x += 37) {
      const i = (y * raster.width + x) * 4;
      expect([output.data[i], output.data[i + 1], output.data[i + 2]]).toEqual([...background]);
    }
  });
});
