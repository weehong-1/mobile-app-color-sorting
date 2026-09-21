import { describe, expect, it } from 'vitest';
import type { ColorClass, IconColor } from './analysis.ts';
import { parsePalette } from './palette.ts';
import { type AnalysedIcon, type SortOptions, HUE_ANCHOR, hueBand, rotateHue, sortIcons } from './sort.ts';

function icon(
  index: number,
  colorClass: ColorClass,
  L: number,
  C: number,
  h: number,
  accent?: { L: number; C: number; h: number },
): AnalysedIcon {
  const color: IconColor = {
    dominant: { L, C, h },
    dominantShare: 0.7,
    accent: accent ?? null,
    accentShare: accent ? 0.2 : 0,
    colorClass,
    sampleCount: 1000,
    tile: { L, C, h },
    tileClass: colorClass,
    mark: accent ?? null,
  };
  return { index, color };
}

const order = (
  icons: readonly AnalysedIcon[],
  options: SortOptions = { mode: 'rainbow', whiteFirst: false },
): number[] => sortIcons(icons, options).map((i) => i.index);

describe('rotateHue', () => {
  it('puts the anchor at zero so pinks lead', () => {
    expect(rotateHue(HUE_ANCHOR)).toBe(0);
  });

  it('wraps past 360 rather than going negative', () => {
    expect(rotateHue(0)).toBe(15);
    expect(rotateHue(344)).toBe(359);
    expect(rotateHue(346)).toBe(1);
  });

  it('orders pink before red before green before blue', () => {
    const [pink, red, green, blue] = [350, 25, 145, 260].map((h) => rotateHue(h));
    expect(pink).toBeLessThan(red!);
    expect(red!).toBeLessThan(green!);
    expect(green!).toBeLessThan(blue!);
  });
});

describe('rainbow sort', () => {
  it('puts the groups in order: chromatic, then white through gray to dark', () => {
    const icons = [
      icon(0, 'white', 0.99, 0.0, 0, { L: 0.6, C: 0.2, h: 260 }),
      icon(1, 'dark', 0.15, 0.01, 20),
      icon(2, 'gray', 0.8, 0.02, 270),
      icon(3, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(icons)).toEqual([3, 0, 2, 1]);
  });

  it('can lead with the ramp instead of trailing with it', () => {
    const icons = [
      icon(0, 'white', 0.99, 0.0, 0, { L: 0.6, C: 0.2, h: 260 }),
      icon(1, 'dark', 0.15, 0.01, 20),
      icon(2, 'gray', 0.8, 0.02, 270),
      icon(3, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(icons, { mode: 'rainbow', whiteFirst: true })).toEqual([0, 2, 1, 3]);
  });

  /** A light grey tile belongs beside the white ones, not among the blues. */
  it('keeps the neutrals together, whatever colours are present', () => {
    const icons = [
      icon(0, 'chromatic', 0.6, 0.2, 260),
      icon(1, 'gray', 0.87, 0.02, 270),
      icon(2, 'white', 0.99, 0.0, 0, { L: 0.6, C: 0.2, h: 25 }),
      icon(3, 'dark', 0.05, 0.0, 0),
    ];
    expect(order(icons)).toEqual([0, 2, 1, 3]);
  });

  it('orders chromatic icons from pink through red to blue', () => {
    const icons = [
      icon(0, 'chromatic', 0.6, 0.2, 260), // blue
      icon(1, 'chromatic', 0.7, 0.2, 145), // green
      icon(2, 'chromatic', 0.6, 0.2, 25),  // red
      icon(3, 'chromatic', 0.7, 0.2, 350), // pink
    ];
    expect(order(icons)).toEqual([3, 2, 1, 0]);
  });

  it('orders the white group by accent hue, with accent-less icons last', () => {
    const icons = [
      icon(0, 'white', 0.99, 0, 0),                               // no accent
      icon(1, 'white', 0.99, 0, 0, { L: 0.6, C: 0.2, h: 260 }),   // blue mark
      icon(2, 'white', 0.99, 0, 0, { L: 0.6, C: 0.2, h: 25 }),    // red mark
    ];
    expect(order(icons)).toEqual([2, 1, 0]);
  });

  /** A black tile's reported hue is noise, so it must not decide the order. */
  it('orders tinted darks by hue and near-neutral darks after them by lightness', () => {
    const icons = [
      icon(0, 'dark', 0.015, 0.000, 166), // black, hue is noise
      icon(1, 'dark', 0.200, 0.090, 250), // navy, has a real hue
      icon(2, 'dark', 0.011, 0.000, 123), // black, darker
      icon(3, 'dark', 0.180, 0.090, 25),  // maroon, has a real hue
    ];
    expect(order(icons)).toEqual([3, 1, 2, 0]);
  });

  it('orders the gray group pale to deep, continuing down from the whites', () => {
    expect(order([icon(0, 'gray', 0.4, 0.02, 0), icon(1, 'gray', 0.8, 0.02, 0)])).toEqual([1, 0]);
  });

  it('breaks ties on the original reading order', () => {
    const same = [icon(2, 'chromatic', 0.6, 0.2, 30), icon(0, 'chromatic', 0.6, 0.2, 30), icon(1, 'chromatic', 0.6, 0.2, 30)];
    expect(order(same)).toEqual([0, 1, 2]);
  });

  it('is stable across repeated runs', () => {
    const icons = [
      icon(0, 'white', 0.99, 0, 0), icon(1, 'white', 0.99, 0, 0),
      icon(2, 'chromatic', 0.6, 0.2, 30), icon(3, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(icons)).toEqual(order(icons));
  });

  it('handles an empty set', () => {
    expect(order([])).toEqual([]);
  });
});

describe('other sort modes', () => {
  const icons = [
    icon(0, 'white', 0.99, 0.0, 0),
    icon(1, 'chromatic', 0.6, 0.2, 260),
    icon(2, 'dark', 0.15, 0.01, 20),
    icon(3, 'chromatic', 0.7, 0.2, 25),
  ];

  it('hue mode puts chromatic icons first, then neutrals by lightness', () => {
    expect(order(icons, { mode: 'hue', whiteFirst: false })).toEqual([3, 1, 2, 0]);
  });

  it('sorts dark to light', () => {
    expect(order(icons, { mode: 'dark-to-light', whiteFirst: false })).toEqual([2, 1, 3, 0]);
  });

  it('sorts light to dark', () => {
    expect(order(icons, { mode: 'light-to-dark', whiteFirst: false })).toEqual([0, 3, 1, 2]);
  });

  it('reverses exactly between the two lightness modes', () => {
    const up = order(icons, { mode: 'dark-to-light', whiteFirst: false });
    const down = order(icons, { mode: 'light-to-dark', whiteFirst: false });
    expect(down).toEqual([...up].reverse());
  });
});

describe('colour families sort', () => {
  const families: SortOptions = { mode: 'families', whiteFirst: false };

  it('groups chromatic icons by family and runs each one pale to deep', () => {
    const icons = [
      icon(0, 'chromatic', 0.50, 0.18, 26),  // deep red
      icon(1, 'chromatic', 0.75, 0.18, 250), // pale blue
      icon(2, 'chromatic', 0.80, 0.18, 22),  // pale red
      icon(3, 'chromatic', 0.55, 0.18, 254), // deep blue
    ];
    // Red family before blue (anchor 345), and pale before deep inside each.
    expect(order(icons, families)).toEqual([2, 0, 1, 3]);
  });

  it('orders families by hue from the anchor, so pink leads', () => {
    const icons = [
      icon(0, 'chromatic', 0.6, 0.18, 250), // blue
      icon(1, 'chromatic', 0.6, 0.18, 145), // green
      icon(2, 'chromatic', 0.6, 0.18, 350), // pink
      icon(3, 'chromatic', 0.6, 0.18, 25),  // red
    ];
    expect(order(icons, families)).toEqual([2, 3, 1, 0]);
  });

  /** Two hues close enough to share a family sort by lightness, not by hue. */
  it('lets lightness decide inside a family, overriding a small hue difference', () => {
    const icons = [
      icon(0, 'chromatic', 0.55, 0.2, 22), // lower hue, deeper
      icon(1, 'chromatic', 0.80, 0.2, 30), // higher hue, paler
    ];
    expect(order(icons, { mode: 'hue', whiteFirst: false })).toEqual([0, 1]);
    expect(order(icons, families)).toEqual([1, 0]);
  });

  it('leaves the neutral groups exactly as the rainbow sorts them', () => {
    const icons = [
      icon(0, 'white', 0.99, 0, 0),
      icon(1, 'white', 0.99, 0, 0, { L: 0.6, C: 0.2, h: 25 }),
      icon(2, 'gray', 0.8, 0.02, 270),
      icon(3, 'gray', 0.4, 0.02, 270),
      icon(4, 'dark', 0.15, 0.0, 120),
      icon(5, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(icons, families)).toEqual(order(icons, { mode: 'rainbow', whiteFirst: false }));
  });

  it('still honours white first', () => {
    const icons = [
      icon(0, 'chromatic', 0.6, 0.2, 30),
      icon(1, 'white', 0.99, 0, 0),
    ];
    expect(order(icons, { mode: 'families', whiteFirst: true })).toEqual([1, 0]);
  });

  /**
   * The palette decides the grouping, so a different one regroups. Both icons
   * fall in the built-in palette's single blue family, where lightness decides;
   * a palette that distinguishes cyan from blue splits them, and family order
   * takes over.
   */
  it('regroups when a different palette is supplied', () => {
    const deepCyan = icon(0, 'chromatic', 0.55, 0.18, 215);
    const paleBlue = icon(1, 'chromatic', 0.85, 0.18, 270);

    expect(order([deepCyan, paleBlue], families)).toEqual([1, 0]);

    const cyanAndBlue = parsePalette(
      ['#22d3ee Light cyan', '#0891b2 Cyan', '#0e7490 Deep cyan',
       '#3b82f6 Light blue', '#2563eb Blue', '#1e40af Deep blue'].join('\n'),
    ).palette!;
    expect(cyanAndBlue.families).toHaveLength(2);
    expect(order([deepCyan, paleBlue], { ...families, palette: cyanAndBlue })).toEqual([0, 1]);
  });

  it('falls back to hue order when the palette has no families', () => {
    const icons = [
      icon(0, 'chromatic', 0.6, 0.2, 250),
      icon(1, 'chromatic', 0.6, 0.2, 25),
    ];
    const empty = { name: 'Empty', swatches: [], families: [] };
    expect(order(icons, { ...families, palette: empty })).toEqual([1, 0]);
  });

  it('breaks ties on reading order like every other mode', () => {
    const same = [
      icon(2, 'chromatic', 0.6, 0.2, 30),
      icon(0, 'chromatic', 0.6, 0.2, 30),
      icon(1, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(same, families)).toEqual([0, 1, 2]);
  });
});

describe('tile, then mark', () => {
  const mode = { mode: 'tile-then-mark', whiteFirst: false } as const;

  /** An icon whose tile and mark are stated independently of its dominant. */
  function card(
    index: number,
    tileClass: ColorClass,
    tile: { L: number; C: number; h: number },
    mark: { L: number; C: number; h: number } | null,
  ): AnalysedIcon {
    return {
      index,
      color: {
        dominant: mark ?? tile,
        dominantShare: 0.7,
        accent: null,
        accentShare: 0,
        colorClass: tileClass,
        sampleCount: 1000,
        tile,
        tileClass,
        mark,
      },
    };
  }

  const WHITE = { L: 0.98, C: 0.01, h: 0 };
  const RED = { L: 0.55, C: 0.2, h: 28 };
  const BLUE = { L: 0.55, C: 0.2, h: 260 };

  it('puts every white card together, whatever colour its mark is', () => {
    const icons = [
      card(0, 'chromatic', RED, null),
      card(1, 'white', WHITE, BLUE),
      card(2, 'chromatic', BLUE, null),
      card(3, 'white', WHITE, RED),
    ];
    // The two cards are adjacent, and the two solid tiles are not between them.
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([0, 2, 3, 1]);
  });

  it('orders the cards by their marks, red before blue', () => {
    const icons = [card(0, 'white', WHITE, BLUE), card(1, 'white', WHITE, RED)];
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([1, 0]);
  });

  it('leaves a card with no mark at the end of its group', () => {
    const icons = [card(0, 'white', WHITE, null), card(1, 'white', WHITE, BLUE)];
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([1, 0]);
  });

  it('orders solid tiles by the tile, since that is what the eye sees', () => {
    const icons = [card(0, 'chromatic', BLUE, null), card(1, 'chromatic', RED, null)];
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([1, 0]);
  });

  it('does not let a mark move an icon out of its tile group', () => {
    // A dark tile with a red mark stays dark; it does not join the red tiles.
    const icons = [card(0, 'dark', { L: 0.18, C: 0.01, h: 240 }, RED), card(1, 'chromatic', RED, null)];
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([1, 0]);
  });

  it('leads with the white cards when asked to', () => {
    const icons = [card(0, 'chromatic', RED, null), card(1, 'white', WHITE, BLUE)];
    expect(sortIcons(icons, { ...mode, whiteFirst: true }).map((icon) => icon.index)).toEqual([1, 0]);
  });

  /**
   * The four red logos on IMG_0910 measure 40.95, 41.05, 43.38 and 44.53
   * degrees from the anchor. Ordering them by hue is ordering them by noise, so
   * one band of hue is one colour and lightness decides inside it.
   */
  it('runs pale to deep within a band of mark hue', () => {
    const icons = [
      card(0, 'white', WHITE, { L: 0.51, C: 0.19, h: 25.95 }),
      card(1, 'white', WHITE, { L: 0.58, C: 0.23, h: 28.38 }),
      card(2, 'white', WHITE, { L: 0.55, C: 0.2, h: 29.53 }),
    ];
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([1, 2, 0]);
  });

  it('still orders by hue when the marks are a band or more apart', () => {
    // A pale blue must not overtake a deep red: the bands decide first.
    const icons = [
      card(0, 'white', WHITE, { L: 0.9, C: 0.2, h: 260 }),
      card(1, 'white', WHITE, { L: 0.4, C: 0.2, h: 28 }),
    ];
    expect(sortIcons(icons, mode).map((icon) => icon.index)).toEqual([1, 0]);
  });
});

describe('hue bands', () => {
  it('puts hues within a band together and separates the next one', () => {
    expect(hueBand(HUE_ANCHOR + 1)).toBe(hueBand(HUE_ANCHOR + 14));
    expect(hueBand(HUE_ANCHOR + 14)).not.toBe(hueBand(HUE_ANCHOR + 16));
  });

  it('counts from the anchor, so the band boundaries do not depend on red', () => {
    expect(hueBand(HUE_ANCHOR)).toBe(0);
  });

  /**
   * The bands have edges, and an edge falls at 45 degrees from the anchor --
   * half a degree past Great Eastern's lion, the reddest of IMG_0910's red
   * marks. A screenshot that measured it a little warmer would file it in the
   * next band and lift it out of the red run. This is recorded rather than
   * smoothed away: see ADR-0015.
   */
  it('splits two reds that fall either side of a band edge', () => {
    expect(hueBand(HUE_ANCHOR + 44.53)).toBe(2);
    expect(hueBand(HUE_ANCHOR + 45.0)).toBe(3);
  });

  it('orders the white group pale to deep inside a band, in rainbow too', () => {
    const icons = [
      icon(0, 'white', 0.99, 0.0, 0, { L: 0.5, C: 0.2, h: 26 }),
      icon(1, 'white', 0.99, 0.0, 0, { L: 0.7, C: 0.2, h: 29 }),
    ];
    expect(order(icons)).toEqual([1, 0]);
  });
});
