import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_OPTIONS, analyseSprite, sampleSprite } from './analysis.ts';
import { gradientField } from './gradient.ts';
import { DEFAULT_DETECT_OPTIONS, detectGrid, slotRect } from './grid.ts';
import type { Rect } from './raster.ts';
import { DEFAULT_SPRITE_OPTIONS, extractSprite } from './sprite.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import { BADGE_RED, filled, paintRoundedRect } from '../test-support/synthetic.ts';
import truthDense from '../../fixtures/IMG_0571.truth.json' with { type: 'json' };
import truthSparse from '../../fixtures/IMG_0572.truth.json' with { type: 'json' };

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

    // The same mark in a saturated blue is a real accent.
    const colorful = spriteOf((raster) => {
      paintRoundedRect(raster, { ...ICON, radius: 45 }, [250, 250, 250]);
      paintRoundedRect(raster, { x: 140, y: 140, width: 120, height: 120, radius: 20 }, [30, 90, 230]);
    });
    expect(analyseSprite(colorful).accent).not.toBeNull();
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

  const expectedClasses: Record<string, string> = {
    Endel: 'dark', Spotify: 'dark', VoiceRecorder: 'dark',
    '1Password': 'gray',
    Youdao: 'chromatic', Claude: 'chromatic', Spark: 'chromatic', WhatsApp: 'chromatic',
    WeChat: 'chromatic', Todoist: 'chromatic', Meitu: 'chromatic',
    Owlfiles: 'white', DeepL: 'white', Gemini: 'white', DeepSeek: 'white', ChatGPT: 'white',
    Gmail: 'white', Telegram: 'white', Simplenote: 'white', UpNote: 'white',
    QQMusic: 'white', TickTick: 'white', MinimaList: 'white', '轻颜': 'white',
  };

  it('classifies every icon as agreed', () => {
    const actual = Object.fromEntries([...byName].map(([name, color]) => [name, color.colorClass]));
    const expected = Object.fromEntries([...byName.keys()].map((name) => [name, expectedClasses[name]]));
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

  /** Telegram is a blue circle on a white tile; by area the tile wins. */
  it('calls Telegram white on area, and recovers its blue as the accent', () => {
    const telegram = byName.get('Telegram')!;
    expect(telegram.colorClass).toBe('white');
    expect(telegram.accent).not.toBeNull();
    expect(telegram.accent!.h).toBeGreaterThan(200);
    expect(telegram.accent!.h).toBeLessThan(280);
    expect(telegram.accentShare).toBeGreaterThan(0.3);
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
    expect(chromatic).toEqual(['Meitu', 'Youdao', 'Todoist', 'Claude', 'WhatsApp', 'WeChat', 'Spark']
      .filter((name) => byName.has(name)));
  });

  it("keeps Gmail's badge out of its colour, leaving it white", () => {
    expect(byName.get('Gmail')!.colorClass).toBe('white');
    expect(byName.get('WhatsApp')!.colorClass).toBe('chromatic');
  });
});
