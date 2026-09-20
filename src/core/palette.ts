/**
 * Palettes: sets of named colours that chromatic icons are grouped against.
 *
 * The arrangement this serves comes from a printed colour chart -- hue families
 * as rows, each running pale to deep. The values do not: see ADR-0006. The
 * built-in palette is generated from rules here, and anyone with their own
 * colour book can paste it in instead.
 *
 * Everything works in OKLCH, because families are decided by hue and steps by
 * lightness. Hex is carried only so the interface can draw a swatch.
 */
import {
  type Oklch,
  hexToRgb,
  oklabToOklch,
  oklabToRgb,
  oklchToOklab,
  reduceChromaToGamut,
  rgbToHex,
  rgbToOklab,
} from './color.ts';

export interface Swatch {
  readonly name: string;
  /** sRGB, for drawing the swatch. */
  readonly hex: string;
  readonly lch: Oklch;
}

export interface Family {
  readonly name: string;
  /** Circular mean hue of the family's swatches, in degrees. */
  readonly hue: number;
  readonly swatches: readonly Swatch[];
}

export interface Palette {
  readonly name: string;
  readonly swatches: readonly Swatch[];
  readonly families: readonly Family[];
}

/** How many families to cluster a palette into, unless it has fewer colours. */
export const FAMILY_COUNT = 7;

/**
 * Families closer together than this are merged.
 *
 * Without it a small pasted palette produces one family per colour: six colours
 * gave six families, four of them reds separated by tenths of a degree. Two
 * icons a person would call the same red then land in different families, and
 * family order overrides lightness -- so a deep red leads a pale one, which is
 * precisely the grouping this mode exists to provide. The built-in palette's
 * families are at least 35 degrees apart, so nothing there is affected.
 */
export const MIN_FAMILY_SEPARATION = 15;

const BUILTIN_FAMILIES: ReadonlyArray<{ name: string; hue: number }> = [
  { name: 'Pink', hue: 350 },
  { name: 'Red', hue: 25 },
  { name: 'Orange', hue: 60 },
  { name: 'Yellow', hue: 100 },
  { name: 'Green', hue: 145 },
  { name: 'Blue', hue: 250 },
  { name: 'Purple', hue: 310 },
];

/**
 * Six steps from pale to deep. Chroma peaks in the middle because that is where
 * a hue can actually hold it; anything beyond the gamut is pulled back by
 * chroma rather than by clipping, which would bend the hue.
 */
const BUILTIN_STEPS: ReadonlyArray<{ prefix: string; L: number; C: number }> = [
  { prefix: 'Pale', L: 0.90, C: 0.07 },
  { prefix: 'Light', L: 0.80, C: 0.12 },
  { prefix: '', L: 0.70, C: 0.17 },
  { prefix: 'Strong', L: 0.60, C: 0.19 },
  { prefix: 'Deep', L: 0.50, C: 0.17 },
  { prefix: 'Dark', L: 0.40, C: 0.14 },
];

/**
 * Palettes live in sRGB throughout, because that is what a hex value means,
 * whether it was authored here or pasted in. OKLCH itself is absolute -- the
 * colour space only says how to read the input -- so palette hues and icon hues
 * are directly comparable even when a screenshot is Display P3.
 */
function swatchFrom(name: string, lch: Oklch): Swatch {
  const fitted = reduceChromaToGamut(lch, 'srgb');
  return { name, hex: rgbToHex(...oklabToRgb(oklchToOklab(fitted), 'srgb')), lch: fitted };
}

/** Seven families in six steps, generated from rules rather than copied. */
export function builtinPalette(): Palette {
  const families = BUILTIN_FAMILIES.map((family) => ({
    name: family.name,
    hue: family.hue,
    swatches: BUILTIN_STEPS.map((step) =>
      swatchFrom(
        step.prefix ? `${step.prefix} ${family.name.toLowerCase()}` : family.name,
        { L: step.L, C: step.C, h: family.hue },
      ),
    ),
  }));
  return { name: 'Built-in', swatches: families.flatMap((f) => f.swatches), families };
}

const degreesToRadians = Math.PI / 180;

/** Index of the item with the smallest score, or -1 for an empty list. */
function indexOfSmallest<T>(items: readonly T[], score: (item: T, index: number) => number): number {
  let best = -1;
  let bestScore = Infinity;
  items.forEach((item, index) => {
    const value = score(item, index);
    if (value < bestScore) {
      bestScore = value;
      best = index;
    }
  });
  return best;
}

/** Shortest angle between two hues, 0 to 180. */
export function hueDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/** Circular mean of a set of hues, which a plain average gets wrong at the wrap. */
export function meanHue(hues: readonly number[]): number {
  let x = 0;
  let y = 0;
  for (const hue of hues) {
    x += Math.cos(hue * degreesToRadians);
    y += Math.sin(hue * degreesToRadians);
  }
  if (x === 0 && y === 0) return 0;
  const mean = ((Math.atan2(y, x) / degreesToRadians) % 360 + 360) % 360;
  // Hues either side of the wrap average to a hair under 360, which is the same
  // angle as 0 but sorts to the opposite end. Snap it.
  return 360 - mean < 1e-9 ? 0 : mean;
}

/**
 * Clusters swatches into families by hue, k-means on the circle with evenly
 * spaced starting points so the result is the same every run.
 *
 * Fixed k rather than a gap threshold: a dense colour book has continuous hue
 * coverage and no gaps to split on, but its centroids still land where its
 * colours actually are -- which is how a blue-heavy palette comes to have
 * several blue families.
 */
export function clusterFamilies(swatches: readonly Swatch[], count = FAMILY_COUNT): Family[] {
  const usable = swatches.filter((swatch) => swatch.lch.C > 0.02);
  if (usable.length === 0) return [];
  const k = Math.min(count, usable.length);

  let centroids = Array.from({ length: k }, (_, i) => (i * 360) / k);
  let assignment: number[] = [];

  const assign = (): number[] =>
    usable.map((swatch) =>
      Math.max(0, indexOfSmallest(centroids, (centroid) => hueDistance(swatch.lch.h, centroid))),
    );

  for (let iteration = 0; iteration < 32; iteration++) {
    assignment = assign();

    const next = centroids.map((centroid, index) => {
      const members = usable.filter((_, i) => assignment[i] === index);
      return members.length === 0 ? centroid : meanHue(members.map((s) => s.lch.h));
    });

    // Evenly spaced starting points are reproducible but land in local minima:
    // on the built-in palette one centroid falls between pink and red, catching
    // both, while another catches nothing. Move an empty centroid onto the
    // colour currently worst served, which splits the cluster that merged.
    const taken = new Set<number>();
    next.forEach((_, index) => {
      if (usable.some((_, i) => assignment[i] === index)) return;
      const worst = indexOfSmallest(usable, (swatch, i) =>
        taken.has(i) ? Infinity : -hueDistance(swatch.lch.h, next[assignment[i]!]!),
      );
      const worstDistance =
        worst < 0 ? -1 : hueDistance(usable[worst]!.lch.h, next[assignment[worst]!]!);
      if (worst >= 0 && worstDistance > 0) {
        taken.add(worst);
        next[index] = usable[worst]!.lch.h;
      }
    });

    const settled = next.every((hue, index) => hueDistance(hue, centroids[index]!) < 0.01);
    centroids = next;
    if (settled) break;
  }
  assignment = assign();

  const families: Family[] = [];
  centroids.forEach((hue, index) => {
    const members = usable.filter((_, i) => assignment[i] === index);
    if (members.length === 0) return;
    families.push({ name: '', hue, swatches: members });
  });
  return mergeCloseFamilies(families)
    .map(namedAndSorted)
    .sort((a, b) => a.hue - b.hue);
}

function namedAndSorted(family: Family): Family {
  const swatches = [...family.swatches].sort((a, b) => b.lch.L - a.lch.L);
  return {
    ...family,
    swatches,
    name: family.name || swatches[Math.floor(swatches.length / 2)]!.name,
  };
}

/** Repeatedly merges the closest pair of families until none are too close. */
export function mergeCloseFamilies(
  families: readonly Family[],
  separation = MIN_FAMILY_SEPARATION,
): Family[] {
  let current = [...families];
  for (;;) {
    let closest: [number, number] | null = null;
    let closestDistance = separation;
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const distance = hueDistance(current[i]!.hue, current[j]!.hue);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = [i, j];
        }
      }
    }
    if (!closest) return current;

    const [i, j] = closest;
    const swatches = [...current[i]!.swatches, ...current[j]!.swatches];
    const merged: Family = { name: '', hue: meanHue(swatches.map((s) => s.lch.h)), swatches };
    current = current.filter((_, index) => index !== i && index !== j);
    current.push(merged);
  }
}

/** Index of the family whose hue is nearest, or -1 when the palette has none. */
export function familyIndexFor(hue: number, palette: Palette): number {
  return indexOfSmallest(palette.families, (family) => hueDistance(hue, family.hue));
}

/** Nearest swatch by hue then lightness, used for naming a colour. */
export function nearestSwatch(lch: Oklch, palette: Palette): Swatch | null {
  const index = familyIndexFor(lch.h, palette);
  if (index < 0) return null;
  const family = palette.families[index]!;
  const nearest = indexOfSmallest(family.swatches, (swatch) => Math.abs(swatch.lch.L - lch.L));
  return nearest < 0 ? null : family.swatches[nearest]!;
}

export interface ParseResult {
  readonly palette: Palette | null;
  /** One message per line that could not be read. */
  readonly errors: readonly string[];
}

const HEX = /^#?([0-9a-f]{6})(?![0-9a-f])/i;

/**
 * Reads a pasted palette: one colour per line, the hex value first, anything
 * after it on the line taken as the name. Separators may be spaces, commas or
 * tabs. Blank lines and lines starting with // are ignored, so a list can carry
 * comments; # is not a comment marker, because it starts a hex value.
 *
 * The hex is anchored to the start of the line rather than found anywhere in
 * it. Searching would accept "Deep blue #1b4f9c" while silently dropping the
 * name, and would read "#1b4f9c12" as the quite different colour #4f9c12.
 */
export function parsePalette(text: string, name = 'Pasted'): ParseResult {
  const swatches: Swatch[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) return;

    const match = HEX.exec(line);
    if (!match) {
      errors.push(`Line ${index + 1}: no six-digit hex colour found in "${line.slice(0, 40)}"`);
      return;
    }
    const rest = line.slice(match.index + match[0].length).replace(/^[\s,;\t]+/, '').trim();
    const rgb = hexToRgb(match[1]!);
    const lch = oklabToOklch(rgbToOklab(rgb[0], rgb[1], rgb[2], 'srgb'));
    swatches.push({ name: rest === '' ? `#${match[1]!.toLowerCase()}` : rest, hex: rgbToHex(...rgb), lch });
  });

  if (swatches.length === 0) {
    return {
      palette: null,
      errors: errors.length > 0 ? errors : ['No colours found. Add one hex value per line, such as #1b4f9c.'],
    };
  }

  const families = clusterFamilies(swatches);
  if (families.length === 0) {
    return {
      palette: null,
      errors: [...errors, 'Every colour in that list is grey. A palette needs colours with some saturation.'],
    };
  }
  return { palette: { name, swatches, families }, errors };
}
