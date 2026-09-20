import { describe, expect, it } from 'vitest';
import {
  type ColorSpace,
  chroma,
  decodeChannel,
  encodeChannel,
  hexToRgb,
  isInGamut,
  labDistance,
  oklabToOklch,
  oklabToRgb,
  oklchToOklab,
  rgbToHex,
  reduceChromaToGamut,
  rgbToOklab,
  transformsFor,
} from './color.ts';
import { invert, multiply } from './matrix.ts';
import type { Mat3 } from './matrix.ts';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Ottosson's published sRGB constants. We derive ours from the primaries rather
 * than transcribing these, so this is a check that the derivation is right.
 */
const PUBLISHED_LMS_FROM_LINEAR_SRGB: Mat3 = [
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
];

const PUBLISHED_LINEAR_SRGB_FROM_LMS: Mat3 = [
  4.0767416621, -3.3077115913, 0.2309699292,
  -1.2684380046, 2.6097574011, -0.3413193965,
  -0.0041960863, -0.7034186147, 1.7076147010,
];

describe('matrix', () => {
  it('inverts to the identity', () => {
    const m = transformsFor('display-p3').lmsFromLinear;
    const product = multiply(m, invert(m));
    for (let i = 0; i < 9; i++) expect(product[i]!).toBeCloseTo(IDENTITY[i]!, 12);
  });

  it('rejects a singular matrix', () => {
    expect(() => invert([1, 2, 3, 2, 4, 6, 3, 6, 9])).toThrow(/not invertible/i);
  });
});

describe('derived sRGB transforms', () => {
  it('matches the published forward matrix', () => {
    const derived = transformsFor('srgb').lmsFromLinear;
    for (let i = 0; i < 9; i++) {
      expect(derived[i]!).toBeCloseTo(PUBLISHED_LMS_FROM_LINEAR_SRGB[i]!, 6);
    }
  });

  it('matches the published inverse matrix', () => {
    const derived = transformsFor('srgb').linearFromLms;
    for (let i = 0; i < 9; i++) {
      expect(derived[i]!).toBeCloseTo(PUBLISHED_LINEAR_SRGB_FROM_LMS[i]!, 6);
    }
  });
});

describe('rgbToOklab', () => {
  const spaces: ColorSpace[] = ['srgb', 'display-p3'];

  it.each(spaces)('puts white at L=1 with no chroma in %s', (space) => {
    const white = rgbToOklab(255, 255, 255, space);
    expect(white.L).toBeCloseTo(1, 6);
    expect(chroma(white)).toBeCloseTo(0, 6);
  });

  it.each(spaces)('puts black at L=0 with no chroma in %s', (space) => {
    const black = rgbToOklab(0, 0, 0, space);
    expect(black.L).toBeCloseTo(0, 6);
    expect(chroma(black)).toBeCloseTo(0, 6);
  });

  it.each(spaces)('leaves mid grey neutral in %s', (space) => {
    const grey = rgbToOklab(128, 128, 128, space);
    expect(chroma(grey)).toBeCloseTo(0, 6);
    expect(grey.L).toBeGreaterThan(0.4);
    expect(grey.L).toBeLessThan(0.7);
  });

  // Reference values from Ottosson's article, sRGB.
  it.each([
    ['red', [255, 0, 0], [0.6279, 0.2249, 0.1258]],
    ['green', [0, 255, 0], [0.8664, -0.2339, 0.1795]],
    ['blue', [0, 0, 255], [0.4520, -0.0324, -0.3115]],
  ] as const)('matches the published sRGB value for %s', (_name, rgb, expected) => {
    const lab = rgbToOklab(rgb[0], rgb[1], rgb[2], 'srgb');
    expect(lab.L).toBeCloseTo(expected[0], 3);
    expect(lab.a).toBeCloseTo(expected[1], 3);
    expect(lab.b).toBeCloseTo(expected[2], 3);
  });

  /**
   * The reason the pipeline works in P3 (ADR-0004): the same encoded primary is
   * a more saturated colour in P3, and converting to sRGB would clip that away.
   */
  it.each([
    ['red', [255, 0, 0]],
    ['green', [0, 255, 0]],
  ] as const)('gives %s more chroma in P3 than in sRGB', (_name, rgb) => {
    const inSrgb = chroma(rgbToOklab(rgb[0], rgb[1], rgb[2], 'srgb'));
    const inP3 = chroma(rgbToOklab(rgb[0], rgb[1], rgb[2], 'display-p3'));
    expect(inP3).toBeGreaterThan(inSrgb * 1.1);
  });

  it('orders hues so that red, green and blue fall in the expected sectors', () => {
    const hue = (r: number, g: number, b: number) =>
      oklabToOklch(rgbToOklab(r, g, b, 'display-p3')).h;
    expect(hue(255, 0, 0)).toBeGreaterThan(0);
    expect(hue(255, 0, 0)).toBeLessThan(60);
    expect(hue(0, 255, 0)).toBeGreaterThan(120);
    expect(hue(0, 255, 0)).toBeLessThan(160);
    expect(hue(0, 0, 255)).toBeGreaterThan(240);
    expect(hue(0, 0, 255)).toBeLessThan(290);
  });
});

describe('round trips', () => {
  const samples: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0, 0], [255, 255, 255], [128, 128, 128], [255, 59, 48],
    [10, 102, 194], [217, 119, 87], [37, 211, 102], [18, 24, 45],
  ];

  it.each(['srgb', 'display-p3'] as const)('survives rgb to oklab and back in %s', (space) => {
    for (const [r, g, b] of samples) {
      const back = oklabToRgb(rgbToOklab(r, g, b, space), space);
      expect(back[0]).toBeCloseTo(r, 0);
      expect(back[1]).toBeCloseTo(g, 0);
      expect(back[2]).toBeCloseTo(b, 0);
    }
  });

  it('survives oklab to oklch and back', () => {
    for (const [r, g, b] of samples) {
      const lab = rgbToOklab(r, g, b, 'display-p3');
      const back = oklchToOklab(oklabToOklch(lab));
      expect(back.L).toBeCloseTo(lab.L, 9);
      expect(back.a).toBeCloseTo(lab.a, 9);
      expect(back.b).toBeCloseTo(lab.b, 9);
    }
  });

  it('survives the transfer function in both directions', () => {
    for (let i = 0; i < 256; i++) expect(encodeChannel(decodeChannel(i))).toBe(i);
  });
});

describe('oklch', () => {
  it('reports hue in degrees from 0 to 360', () => {
    for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 255]] as const) {
      const { h } = oklabToOklch(rgbToOklab(r, g, b, 'display-p3'));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('labDistance', () => {
  it('is zero for a colour against itself', () => {
    const lab = rgbToOklab(10, 102, 194, 'display-p3');
    expect(labDistance(lab, lab)).toBe(0);
  });

  it('separates navy from teal by more than navy from near-navy', () => {
    const navy = rgbToOklab(18, 24, 45, 'display-p3');
    const teal = rgbToOklab(0, 168, 168, 'display-p3');
    const nearNavy = rgbToOklab(22, 28, 50, 'display-p3');
    expect(labDistance(navy, teal)).toBeGreaterThan(labDistance(navy, nearNavy) * 5);
  });
});

describe('hex helpers', () => {
  it('parses with and without a leading hash', () => {
    expect(hexToRgb('#ff3b30')).toEqual([255, 59, 48]);
    expect(hexToRgb('ff3b30')).toEqual([255, 59, 48]);
  });

  it('rejects anything that is not six hex digits', () => {
    for (const bad of ['#fff', 'nope', '#ff3b3', '#ff3b30ff']) {
      expect(() => hexToRgb(bad)).toThrow(/six-digit hex/i);
    }
  });

  it('round trips through hex', () => {
    expect(rgbToHex(...hexToRgb('#12182d'))).toBe('#12182d');
  });
});

describe('gamut', () => {
  it('accepts colours that are displayable and rejects ones that are not', () => {
    expect(isInGamut(rgbToOklab(128, 128, 128, 'display-p3'), 'display-p3')).toBe(true);
    // A vivid green at high lightness is beyond sRGB.
    expect(isInGamut(oklchToOklab({ L: 0.88, C: 0.3, h: 145 }), 'srgb')).toBe(false);
  });

  it('reduces chroma until a colour fits, keeping hue and lightness', () => {
    const wanted = { L: 0.88, C: 0.3, h: 145 };
    const fitted = reduceChromaToGamut(wanted, 'srgb');
    expect(fitted.h).toBe(wanted.h);
    expect(fitted.L).toBe(wanted.L);
    expect(fitted.C).toBeLessThan(wanted.C);
    expect(isInGamut(oklchToOklab(fitted), 'srgb')).toBe(true);
  });

  it('leaves a colour that already fits alone', () => {
    const fits = { L: 0.6, C: 0.05, h: 250 };
    expect(reduceChromaToGamut(fits, 'srgb')).toEqual(fits);
  });

  /** P3 is the wider space, so it can hold at least as much chroma. */
  it('keeps more chroma in P3 than in sRGB', () => {
    const wanted = { L: 0.6, C: 0.35, h: 25 };
    expect(reduceChromaToGamut(wanted, 'display-p3').C)
      .toBeGreaterThan(reduceChromaToGamut(wanted, 'srgb').C);
  });
});
