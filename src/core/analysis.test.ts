import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_OPTIONS, analyseSprite, sampleSprite } from './analysis.ts';
import { gradientField } from './gradient.ts';
import { DEFAULT_DETECT_OPTIONS, detectGrid, slotRect } from './grid.ts';
import type { Rect } from './raster.ts';
import { DEFAULT_SPRITE_OPTIONS, extractSprite } from './sprite.ts';
import { AGREED_CLASSES } from '../test-support/agreed-classes.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import { BADGE_RED, filled, paintRoundedRect } from '../test-support/synthetic.ts';
import truthDense from '../../fixtures/IMG_0571.truth.json' with { type: 'json' };
import truthSparse from '../../fixtures/IMG_0572.truth.json' with { type: 'json' };
import truthFlat from '../../fixtures/IMG_0910.truth.json' with { type: 'json' };

const SIZE = 200;
const ICON: Rect = { x: 100, y: 100, width: SIZE, height: SIZE };

function spriteOf(paint: (raster: ReturnType<typeof filled>) => void, withBadge = false) {
  const raster = filled(500, 500, [200, 198, 188]);
  paint(raster);
  if (withBadge) {
    paintRoundedRect(raster, { x: 100 + SIZE - 44, y: 100 - 32, width: 76, height: 76, radius: 38 }, BADGE_RED);
  }
  return extractSprite(raster, ICON, DEFAULT_SPRITE_OPTIONS);
}

function mix(from: readonly [number, number, number], to: readonly [number, number, number], t: number) {
  return [0, 1, 2].map((c) => Math.round(from[c]! + (to[c]! - from[c]!) * t)) as unknown as
    readonly [number, number, number];
}

const NAVY = [18, 24, 45] as const;
const TEAL = [0, 168, 168] as const;

describe('analyseSprite on synthetic icons', () => {
  /** Area wins: a thin stripe of a louder colour must not take the icon. */
  it('calls a mostly-navy tile with a teal stripe navy', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: SIZE * 0.225 }, NAVY);
      paintRoundedRect(raster, { x: 100, y: 100 + SIZE - 30, width: SIZE, height: 30, radius: 0 }, TEAL);
    });
    const color = analyseSprite(sprite);
    expect(color.colorClass).toBe('dark');
    expect(color.dominant.L).toBeLessThan(0.32);
    // Teal is present, and is picked up as the accent rather than the dominant.
    expect(color.accent).not.toBeNull();
    expect(color.accent!.h).toBeGreaterThan(150);
  });

  it('classifies a white tile as white and a black one as dark', () => {
    const white = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [252, 252, 252])));
    expect(white.colorClass).toBe('white');
    const black = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [12, 12, 12])));
    expect(black.colorClass).toBe('dark');
  });

  it('classifies a mid grey as gray, not white', () => {
    const grey = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [150, 150, 152])));
    expect(grey.colorClass).toBe('gray');
  });

  it('finds no accent on a plain tile', () => {
    expect(analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [40, 120, 220]))).accent)
      .toBeNull();
  });

  it('ignores a mark too small to count as an accent', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [250, 250, 250]);
      // ~0.3% of the icon, well under the minimum share.
      paintRoundedRect(raster, { x: 140, y: 140, width: 11, height: 11, radius: 0 }, [220, 20, 20]);
    });
    expect(analyseSprite(sprite).accent).toBeNull();
  });

  /**
   * A dark navy mark on a white tile clears the per-pixel chroma gate but is
   * not a colour to sort by; it belongs with the black marks.
   */
  it('rejects an accent whose cluster is barely coloured', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [250, 250, 250]);
      paintRoundedRect(raster, { x: 140, y: 140, width: 120, height: 120, radius: 20 }, [24, 30, 52]);
    });
    expect(analyseSprite(sprite).accent).toBeNull();
    expect(analyseSprite(sprite).colorClass).toBe('white');

    // The same mark in a saturated blue is a real accent. Kept under
    // `markMinShare` here, so it stays a mark rather than taking the icon.
    const colorful = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [250, 250, 250]);
      paintRoundedRect(raster, { x: 140, y: 140, width: 80, height: 80, radius: 20 }, [30, 90, 230]);
    });
    expect(analyseSprite(colorful).accent).not.toBeNull();
    expect(analyseSprite(colorful).colorClass).toBe('white');
  });

  /**
   * ...and once the mark is big enough to be what you see, it is the icon's
   * colour rather than a detail on a white tile. Donate Blood is the case: a
   * red drop over a third of a white tile, which sorted half a page from the
   * red icons while the tile spoke for it.
   */
  it('lets a big mark on a white tile speak for the icon', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [250, 250, 250]);
      // 30% of the icon, well over markMinShare.
      paintRoundedRect(raster, { x: 145, y: 145, width: 110, height: 110, radius: 20 }, [212, 40, 40]);
    });
    const color = analyseSprite(sprite);
    expect(color.colorClass).toBe('chromatic');
    expect(color.dominant.C).toBeGreaterThan(0.1);
    expect((color.dominant.h - 330 + 360) % 360).toBeLessThan(100);
  });

  /**
   * The Instagram case. A gradient tile has no flat region, so the quantiser
   * splits it across dozens of bins and the flat white glyph wins the vote with
   * under a fifth of the pixels -- which used to file a vivid pink icon with
   * the white tiles, at the far end of the rainbow from the reds it belongs to.
   */
  it('calls a gradient tile with a white glyph chromatic, not white', () => {
    const sprite = spriteOf((raster) => {
      // Orange to pink to violet across the diagonal: high chroma everywhere,
      // and no two neighbouring bins holding the same colour.
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const t = (x + y) / (2 * SIZE - 2);
          const color = t < 0.5
            ? mix([255, 176, 56], [226, 40, 116], t * 2)
            : mix([226, 40, 116], [124, 40, 202], (t - 0.5) * 2);
          paintRoundedRect(raster, { x: 100 + x, y: 100 + y, width: 1, height: 1, radius: 0 }, color);
        }
      }
      // The camera outline: one flat white block over about 18% of the icon.
      paintRoundedRect(raster, { x: 155, y: 155, width: 85, height: 85, radius: 12 }, [252, 252, 252]);
    });

    const color = analyseSprite(sprite);
    expect(color.colorClass).toBe('chromatic');
    expect(color.dominant.C).toBeGreaterThan(0.1);
    // One of the colours the tile is actually made of: the pink-to-orange arc,
    // which straddles zero degrees.
    expect((color.dominant.h - 330 + 360) % 360).toBeLessThan(100);
  });

  /**
   * A tile too dark to be a white background keeps the stricter rule: it is
   * taken over only when its colour is shattered, not merely outnumbered.
   */
  it('leaves a grey tile grey when coloured marks merely outnumber the grey', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [178, 178, 180]);
      // Two flat blocks, 28% of the icon each: coloured pixels are the
      // majority, but the grey is still half as much of the icon again.
      paintRoundedRect(raster, { x: 105, y: 105, width: 106, height: 106, radius: 0 }, [30, 90, 230]);
      paintRoundedRect(raster, { x: 189, y: 189, width: 106, height: 106, radius: 0 }, [30, 190, 90]);
    });
    expect(analyseSprite(sprite).colorClass).toBe('gray');
  });

  /**
   * TNG eWallet is the case: lightness 0.33 against a cut of 0.32, filed among
   * the colours and stood between Alipay and the white cards. See ADR-0015.
   */
  it('calls a muted tile just above the cut dark', () => {
    const sprite = spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [52, 46, 96]));
    const color = analyseSprite(sprite);
    expect(color.dominant.L).toBeGreaterThan(DEFAULT_ANALYSIS_OPTIONS.darkMaxLightness);
    expect(color.colorClass).toBe('dark');
  });

  it('leaves a vivid tile at the same lightness a colour', () => {
    const muted = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [52, 46, 96])));
    const vivid = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [70, 20, 160])));
    // The vivid one is the lighter of the two, so it is not lightness saving it.
    expect(vivid.dominant.L).toBeGreaterThan(muted.dominant.L);
    expect(vivid.dominant.C).toBeGreaterThan(DEFAULT_ANALYSIS_OPTIONS.mutedDarkMaxChroma);
    expect(vivid.colorClass).toBe('chromatic');
  });

  it('moves the muted band with the dark threshold rather than fixing it', () => {
    const sprite = spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [52, 46, 96]));
    const strict = analyseSprite(sprite, { ...DEFAULT_ANALYSIS_OPTIONS, darkMaxLightness: 0.2 });
    expect(strict.colorClass).not.toBe('dark');
  });

  it('respects an adjustable dark threshold', () => {
    const sprite = spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [90, 96, 120]));
    const strict = analyseSprite(sprite, { ...DEFAULT_ANALYSIS_OPTIONS, darkMaxLightness: 0.2 });
    const loose = analyseSprite(sprite, { ...DEFAULT_ANALYSIS_OPTIONS, darkMaxLightness: 0.6 });
    expect(strict.colorClass).not.toBe('dark');
    expect(loose.colorClass).toBe('dark');
  });

  it('leaves the badge out of the colour it reports', () => {
    const withBadge = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [250, 250, 250]), true));
    const without = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [250, 250, 250])));
    expect(withBadge.colorClass).toBe('white');
    expect(withBadge.dominant.L).toBeCloseTo(without.dominant.L, 2);
    expect(withBadge.accent).toBeNull();
  });

  it('samples only pixels fully inside the mask', () => {
    const sprite = spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: SIZE * 0.225 }, [40, 120, 220]));
    const samples = sampleSprite(sprite, DEFAULT_ANALYSIS_OPTIONS);
    expect(samples.length).toBeGreaterThan(0);
    // Every sample is the tile colour, so no wallpaper crept in at the corners.
    const strays = samples.filter((s) => s.L > 0.8);
    expect(strays).toHaveLength(0);
  });
});

describe.each([
  ['dense', FIXTURES.dense, truthDense],
  ['sparse', FIXTURES.sparse, truthSparse],
] as const)('analysis of the %s fixture', (_name, path, truth) => {
  const raster = readPng(path);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);
  const byName = new Map(
    detection.occupied.map((slot, index) => {
      const rect = slotRect(detection.grid, slot);
      const sprite = extractSprite(
        raster,
        { x: rect.start, y: rect.top, width: detection.grid.size, height: detection.grid.size },
        DEFAULT_SPRITE_OPTIONS,
      );
      return [truth.icons[index]!.name, analyseSprite(sprite)] as const;
    }),
  );

  it('classifies every icon as agreed', () => {
    const actual = Object.fromEntries([...byName].map(([name, color]) => [name, color.colorClass]));
    const expected = Object.fromEntries([...byName.keys()].map((name) => [name, AGREED_CLASSES[name]]));
    expect(actual).toEqual(expected);
  });

  it('gives every icon a dominant colour covering a serious share of it', () => {
    for (const [name, color] of byName) {
      expect(color.sampleCount, name).toBeGreaterThan(1000);
      expect(color.dominantShare, name).toBeGreaterThan(0.2);
    }
  });
});

describe('the dense fixture in detail', () => {
  const raster = readPng(FIXTURES.dense);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);
  const byName = new Map(
    detection.occupied.map((slot, index) => {
      const rect = slotRect(detection.grid, slot);
      return [
        truthDense.icons[index]!.name,
        analyseSprite(extractSprite(raster, {
          x: rect.start, y: rect.top, width: detection.grid.size, height: detection.grid.size,
        }, DEFAULT_SPRITE_OPTIONS)),
      ] as const;
    }),
  );

  /**
   * Telegram is a blue circle over half a white tile. The tile wins on area,
   * but a mark that big is what the icon looks like, so the blue takes it.
   */
  it('reads Telegram as blue, not as the white tile under it', () => {
    const telegram = byName.get('Telegram')!;
    expect(telegram.colorClass).toBe('chromatic');
    expect(telegram.dominant.h).toBeGreaterThan(200);
    expect(telegram.dominant.h).toBeLessThan(280);
    expect(telegram.dominant.C).toBeGreaterThan(0.1);
  });

  /** Gmail's mark covers 17% of its tile, under the bar, so the tile keeps it. */
  it('keeps a small mark as an accent on a white tile', () => {
    const gmail = byName.get('Gmail')!;
    expect(gmail.colorClass).toBe('white');
    expect(gmail.accent).not.toBeNull();
    expect(gmail.accentShare).toBeLessThan(0.2);
  });

  /** Both marks are too near-neutral to be a colour to sort by. */
  it.each(['ChatGPT', 'DeepL'])('gives %s no accent', (name) => {
    expect(byName.get(name)!.accent).toBeNull();
  });

  it('reads the chromatic hues in the expected order', () => {
    const chromatic = [...byName]
      .filter(([, color]) => color.colorClass === 'chromatic')
      .map(([name, color]) => ({ name, h: color.dominant.h }))
      .sort((a, b) => a.h - b.h)
      .map((entry) => entry.name);
    expect(chromatic).toEqual(
      ['Meitu', 'Youdao', 'Todoist', 'Claude', 'WhatsApp', 'WeChat', 'Telegram', 'Spark',
       'Simplenote', 'DeepSeek'].filter((name) => byName.has(name)),
    );
  });

  it("keeps Gmail's badge out of its colour, leaving it white", () => {
    expect(byName.get('Gmail')!.colorClass).toBe('white');
    expect(byName.get('WhatsApp')!.colorClass).toBe('chromatic');
  });
});

describe('the tile and the mark', () => {
  const RED = [214, 52, 46] as const;
  const WHITE = [252, 252, 252] as const;

  /** A white card with a logo on it: the tile is white whatever the logo does. */
  it('reads the tile from the rim even when the mark has taken the icon', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, WHITE);
      // Over a fifth of the icon, so ADR-0011 hands the dominant colour to it.
      paintRoundedRect(raster, { x: 140, y: 140, width: 120, height: 120, radius: 20 }, RED);
    });
    const color = analyseSprite(sprite);

    expect(color.colorClass).toBe('chromatic');
    expect(color.tileClass).toBe('white');
    expect(color.tile.L).toBeGreaterThan(0.9);
    expect(color.mark).not.toBeNull();
    expect(color.mark!.C).toBeGreaterThan(0.1);
    expect(color.mark!.h).toBeGreaterThan(10);
    expect(color.mark!.h).toBeLessThan(60);
  });

  it('reads the tile the same way when the mark is too small to take the icon', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, WHITE);
      paintRoundedRect(raster, { x: 160, y: 160, width: 60, height: 60, radius: 10 }, RED);
    });
    const color = analyseSprite(sprite);

    expect(color.colorClass).toBe('white');
    expect(color.tileClass).toBe('white');
    expect(color.mark).not.toBeNull();
  });

  it('finds no mark on a plain tile', () => {
    const color = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, [40, 120, 220])));
    expect(color.tileClass).toBe('chromatic');
    expect(color.mark).toBeNull();
  });

  it('does not call a white glyph on a coloured tile a mark', () => {
    const sprite = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [40, 120, 220]);
      paintRoundedRect(raster, { x: 150, y: 150, width: 100, height: 100, radius: 10 }, WHITE);
    });
    const color = analyseSprite(sprite);

    expect(color.tileClass).toBe('chromatic');
    // The glyph has no colour of its own, so there is nothing to sort by.
    expect(color.mark).toBeNull();
  });

  it('keeps the badge out of the tile it reads', () => {
    const withBadge = analyseSprite(spriteOf((r) => paintRoundedRect(r, { ...ICON, radius: 45 }, WHITE), true));
    expect(withBadge.tileClass).toBe('white');
    expect(withBadge.tile.C).toBeLessThan(0.05);
  });
});

describe('tiles and marks on the flat fixture', () => {
  const raster = readPng(FIXTURES.flat);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);
  const byName = new Map(
    detection.occupied.map((slot) => {
      const rect = slotRect(detection.grid, slot);
      const truth = truthFlat.icons.find((icon) => icon.column === slot.column && icon.row === slot.row);
      const sprite = extractSprite(
        raster,
        { x: rect.start, y: rect.top, width: detection.grid.size, height: detection.grid.size },
        DEFAULT_SPRITE_OPTIONS,
      );
      return [truth?.name ?? '?', analyseSprite(sprite)] as const;
    }),
  );

  /**
   * The three a reader objected to: white cards carrying a red logo. Whatever
   * `markMinShare` is set to, the tile is white and the mark is red, which is
   * what lets them be grouped as cards and ordered as reds.
   */
  it.each(['MyPB', 'Donate Blood', 'Great Eastern', 'Healthy 365'])('reads %s as a red mark on a white tile', (name) => {
    const color = byName.get(name)!;
    expect(color.tileClass).toBe('white');
    expect(color.mark).not.toBeNull();
    expect(color.mark!.h).toBeGreaterThan(10);
    expect(color.mark!.h).toBeLessThan(60);
  });

  it('still reads a solid red tile as a red tile', () => {
    for (const name of ['AIA+', 'MySingtel', 'Singpass']) {
      expect(byName.get(name)!.tileClass, name).toBe('chromatic');
    }
  });
});
