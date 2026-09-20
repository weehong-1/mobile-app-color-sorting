import { describe, expect, it } from 'vitest';
import { isInGamut, oklchToOklab } from './color.ts';
import {
  FAMILY_COUNT,
  builtinPalette,
  clusterFamilies,
  familyIndexFor,
  mergeCloseFamilies,
  hueDistance,
  meanHue,
  nearestSwatch,
  parsePalette,
} from './palette.ts';

describe('hueDistance', () => {
  it('measures the short way round the circle', () => {
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(90, 90)).toBe(0);
  });
});

describe('meanHue', () => {
  it('averages across the wrap, where a plain mean would not', () => {
    expect(meanHue([350, 10])).toBeCloseTo(0, 4);
    expect(meanHue([10, 30])).toBeCloseTo(20, 4);
  });

  it('returns a hue in 0 to 360', () => {
    const mean = meanHue([300, 20]);
    expect(mean).toBeGreaterThanOrEqual(0);
    expect(mean).toBeLessThan(360);
  });
});

describe('builtinPalette', () => {
  const palette = builtinPalette();

  it('has seven families of six steps', () => {
    expect(palette.families).toHaveLength(FAMILY_COUNT);
    for (const family of palette.families) expect(family.swatches).toHaveLength(6);
    expect(palette.swatches).toHaveLength(42);
  });

  it('is entirely displayable', () => {
    for (const swatch of palette.swatches) {
      expect(isInGamut(oklchToOklab(swatch.lch), 'srgb'), swatch.name).toBe(true);
    }
  });

  it('keeps every step of a family on the family hue', () => {
    for (const family of palette.families) {
      for (const swatch of family.swatches) {
        expect(hueDistance(swatch.lch.h, family.hue), swatch.name).toBeLessThan(0.001);
      }
    }
  });

  it('runs each family from pale to deep', () => {
    for (const family of palette.families) {
      const lightness = family.swatches.map((swatch) => swatch.lch.L);
      expect(lightness).toEqual([...lightness].sort((a, b) => b - a));
    }
  });

  it('gives every swatch a usable name and hex', () => {
    for (const swatch of palette.swatches) {
      expect(swatch.name).not.toBe('');
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('separates its families by hue', () => {
    const hues = palette.families.map((family) => family.hue);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(hueDistance(hues[i]!, hues[j]!)).toBeGreaterThan(20);
      }
    }
  });
});

describe('clusterFamilies', () => {
  const swatchAt = (h: number, L = 0.6, C = 0.15) => ({
    name: `h${h}`, hex: '#000000', lch: { L, C, h },
  });

  it('recovers the families of a palette built from distinct hues', () => {
    const palette = builtinPalette();
    const families = clusterFamilies(palette.swatches);
    expect(families).toHaveLength(FAMILY_COUNT);
    for (const family of families) expect(family.swatches).toHaveLength(6);
  });

  it('is deterministic', () => {
    const swatches = [20, 25, 140, 150, 250, 255].map((h) => swatchAt(h));
    const first = clusterFamilies(swatches, 3).map((f) => Math.round(f.hue));
    const second = clusterFamilies(swatches, 3).map((f) => Math.round(f.hue));
    expect(first).toEqual(second);
  });

  /** The point of clustering from the palette: a blue-heavy list gets blue families. */
  it('splits a hue-heavy palette into several families of that hue', () => {
    const blues = [225, 235, 245, 255, 265, 275].map((h) => swatchAt(h));
    const families = clusterFamilies([...blues, swatchAt(25)], 3);
    const blueFamilies = families.filter((family) => hueDistance(family.hue, 250) < 40);
    expect(blueFamilies.length).toBeGreaterThan(1);
  });

  it('ignores near-grey swatches, which have no usable hue', () => {
    const families = clusterFamilies([swatchAt(25), swatchAt(200, 0.5, 0.005)], 2);
    expect(families.flatMap((family) => family.swatches)).toHaveLength(1);
  });

  it('returns nothing for an all-grey palette', () => {
    expect(clusterFamilies([swatchAt(10, 0.5, 0), swatchAt(200, 0.5, 0.001)])).toEqual([]);
  });

  it('never asks for more families than it has colours', () => {
    expect(clusterFamilies([swatchAt(25), swatchAt(250)], 7)).toHaveLength(2);
  });

  /**
   * Without merging, a small paste gives one family per colour: six colours
   * became six families, four of them reds a tenth of a degree apart. Two icons
   * a person would call the same red then landed in different families, and
   * family order overrode lightness.
   */
  it('merges families that are not perceptually distinct', () => {
    const { palette } = parsePalette(
      ['#c0392b Red', '#e74c3c Light red', '#d94f3a Mid red', '#cf4436 Other red',
       '#2980b9 Blue', '#3498db Light blue'].join('\n'),
    );
    expect(palette!.families).toHaveLength(2);
    const sizes = palette!.families.map((family) => family.swatches.length).sort();
    expect(sizes).toEqual([2, 4]);
  });

  it('keeps families that really are distinct', () => {
    const { palette } = parsePalette(
      ['#22d3ee Cyan', '#0891b2 Deep cyan', '#3b82f6 Blue', '#2563eb Deep blue'].join('\n'),
    );
    expect(palette!.families).toHaveLength(2);
  });

  it('leaves the built-in palette alone, its families being far apart', () => {
    expect(mergeCloseFamilies(builtinPalette().families)).toHaveLength(FAMILY_COUNT);
  });

  it('orders families by hue', () => {
    const families = clusterFamilies([250, 25, 145].map((h) => swatchAt(h)), 3);
    const hues = families.map((family) => family.hue);
    expect(hues).toEqual([...hues].sort((a, b) => a - b));
  });
});

describe('familyIndexFor and nearestSwatch', () => {
  const palette = builtinPalette();

  it('puts a hue in the nearest family', () => {
    const blue = palette.families[familyIndexFor(252, palette)]!;
    expect(hueDistance(blue.hue, 250)).toBeLessThan(1);
  });

  it('wraps rather than falling off the end', () => {
    const pink = palette.families[familyIndexFor(358, palette)]!;
    expect(hueDistance(pink.hue, 350)).toBeLessThan(1);
  });

  it('names a colour by hue then lightness', () => {
    const swatch = nearestSwatch({ L: 0.9, C: 0.06, h: 250 }, palette);
    expect(swatch!.name).toBe('Pale blue');
    const deep = nearestSwatch({ L: 0.4, C: 0.12, h: 250 }, palette);
    expect(deep!.name).toBe('Dark blue');
  });

  it('returns nothing from an empty palette', () => {
    const empty = { name: 'Empty', swatches: [], families: [] };
    expect(familyIndexFor(120, empty)).toBe(-1);
    expect(nearestSwatch({ L: 0.5, C: 0.2, h: 120 }, empty)).toBeNull();
  });
});

describe('parsePalette', () => {
  it('reads hex with a name after it', () => {
    const { palette, errors } = parsePalette('#1b4f9c Deep blue\n#e8c34a Yellow');
    expect(errors).toEqual([]);
    expect(palette!.swatches.map((s) => s.name)).toEqual(['Deep blue', 'Yellow']);
    expect(palette!.swatches[0]!.hex).toBe('#1b4f9c');
  });

  it('accepts hex on its own and names it after the value', () => {
    const { palette } = parsePalette('#1b4f9c\n#e8c34a');
    expect(palette!.swatches[0]!.name).toBe('#1b4f9c');
  });

  it('takes commas and tabs as separators, and a missing leading hash', () => {
    const { palette, errors } = parsePalette('1b4f9c, Deep blue\n#e8c34a\tYellow');
    expect(errors).toEqual([]);
    expect(palette!.swatches.map((s) => s.name)).toEqual(['Deep blue', 'Yellow']);
  });

  it('ignores blank lines and comments', () => {
    const { palette, errors } = parsePalette('// my palette\n\n#1b4f9c Blue\n\n#e8c34a Yellow\n');
    expect(errors).toEqual([]);
    expect(palette!.swatches).toHaveLength(2);
  });

  it('reports the line a bad entry was on and keeps the rest', () => {
    const { palette, errors } = parsePalette('#1b4f9c Blue\nnot a colour\n#e8c34a Yellow');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Line 2');
    expect(palette!.swatches).toHaveLength(2);
  });

  it('requires the hex to start the line, rather than finding one anywhere', () => {
    const { errors } = parsePalette('Deep blue #1b4f9c');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Line 1');
  });

  /** Reading a seven-or-more digit run as a colour would give a different one. */
  it('rejects a hex run longer than six digits instead of taking part of it', () => {
    const { errors } = parsePalette('#1b4f9c12 Blue');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Line 1');
  });

  it('does not treat # as a comment marker, since it starts a hex value', () => {
    const { palette, errors } = parsePalette('#1b4f9c Blue\n# a note\n#e8c34a Yellow');
    expect(palette!.swatches).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });

  it('explains an empty paste instead of returning an empty palette', () => {
    const { palette, errors } = parsePalette('   \n\n');
    expect(palette).toBeNull();
    expect(errors[0]).toContain('one hex value per line');
  });

  it('explains an all-grey palette', () => {
    const { palette, errors } = parsePalette('#888888 Grey\n#cccccc Light grey');
    expect(palette).toBeNull();
    expect(errors.join(' ')).toContain('grey');
  });

  it('clusters what it parsed into families', () => {
    const { palette } = parsePalette(
      ['#c0392b Red', '#e74c3c Light red', '#2980b9 Blue', '#3498db Light blue'].join('\n'),
    );
    expect(palette!.families.length).toBeGreaterThanOrEqual(2);
  });
});
