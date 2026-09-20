import { describe, expect, it } from 'vitest';
import type { ColorClass, IconColor } from './analysis.ts';
import { parsePalette } from './palette.ts';
import { type AnalysedIcon, type SortOptions, HUE_ANCHOR, rotateHue, sortIcons } from './sort.ts';

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
  it('puts the groups in order: chromatic, gray, dark, white', () => {
    const icons = [
      icon(0, 'white', 0.99, 0.0, 0, { L: 0.6, C: 0.2, h: 260 }),
      icon(1, 'dark', 0.15, 0.01, 20),
      icon(2, 'gray', 0.8, 0.02, 270),
      icon(3, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(icons)).toEqual([3, 2, 1, 0]);
  });

  it('can put white first instead', () => {
    const icons = [
      icon(0, 'white', 0.99, 0.0, 0, { L: 0.6, C: 0.2, h: 260 }),
      icon(1, 'dark', 0.15, 0.01, 20),
      icon(2, 'gray', 0.8, 0.02, 270),
      icon(3, 'chromatic', 0.6, 0.2, 30),
    ];
    expect(order(icons, { mode: 'rainbow', whiteFirst: true })).toEqual([0, 3, 2, 1]);
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

  it('orders the gray group by lightness', () => {
    expect(order([icon(0, 'gray', 0.8, 0.02, 0), icon(1, 'gray', 0.4, 0.02, 0)])).toEqual([1, 0]);
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
