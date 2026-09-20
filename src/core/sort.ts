/**
 * Putting icons in order.
 *
 * Hues are rotated before comparison so the rainbow starts near pink rather
 * than at an arbitrary red: pinks lead, then reds, oranges, greens, blues and
 * violets. Every mode is a stable sort over the icons' reading order, so two
 * icons the eye cannot tell apart keep the positions they had on the original
 * screen instead of swapping unpredictably between runs.
 */
import { type ColorClass, type IconColor, DEFAULT_ANALYSIS_OPTIONS } from './analysis.ts';
import { type Palette, builtinPalette, familyIndexFor } from './palette.ts';

/**
 * The list is the source of truth and the union derives from it, so a mode
 * cannot be added to one and forgotten in the other. It was: a saved
 * 'families' preference silently reverted to rainbow, because the validation
 * list was typed `readonly SortMode[]` and a missing member is not a type error.
 */
export const SORT_MODES = ['rainbow', 'families', 'hue', 'dark-to-light', 'light-to-dark'] as const;

export type SortMode = (typeof SORT_MODES)[number];

export interface SortOptions {
  readonly mode: SortMode;
  /** Put the white group first instead of last. */
  readonly whiteFirst: boolean;
  /**
   * Chroma below which a colour has no hue worth sorting by. Defaults to the
   * same value the classifier calls neutral.
   */
  readonly neutralChroma?: number;
  /** Used by the 'families' mode; the built-in palette is used if omitted. */
  readonly palette?: Palette;
}

export const DEFAULT_SORT_OPTIONS: SortOptions = { mode: 'rainbow', whiteFirst: false };

/**
 * Where the rainbow begins, in OKLCH degrees. A constant rather than a control:
 * it decides what "the default order" means, and a dial would let people
 * produce orders that do not start with pinks.
 */
export const HUE_ANCHOR = 345;

export function rotateHue(hue: number, anchor: number = HUE_ANCHOR): number {
  return ((hue - anchor) % 360 + 360) % 360;
}

export interface AnalysedIcon {
  /** Position in the original screenshot's reading order. */
  readonly index: number;
  readonly color: IconColor;
}

const RAINBOW_GROUPS: readonly ColorClass[] = ['chromatic', 'gray', 'dark', 'white'];

let defaultPalette: Palette | null = null;

function fallbackPalette(): Palette {
  defaultPalette ??= builtinPalette();
  return defaultPalette;
}

/**
 * Chromatic icons grouped into the palette's hue families, families in hue
 * order from the anchor, and each family running pale to deep -- the
 * arrangement of a printed colour chart.
 *
 * Ordering within a family is by the icon's own lightness rather than by which
 * swatch it snapped to, so the palette's steps name colours but do not move
 * them. Only the family boundaries change the order, which is why loading a
 * different palette is worth doing.
 */
function byFamily(icons: readonly AnalysedIcon[], palette: Palette): AnalysedIcon[] {
  if (palette.families.length === 0) {
    return orderBy(icons, [(icon) => rotateHue(icon.color.dominant.h)]);
  }
  return orderBy(icons, [
    (icon) => {
      const index = familyIndexFor(icon.color.dominant.h, palette);
      return index < 0 ? 360 : rotateHue(palette.families[index]!.hue);
    },
    (icon) => -icon.color.dominant.L,
  ]);
}
const WHITE_FIRST_GROUPS: readonly ColorClass[] = ['white', 'chromatic', 'gray', 'dark'];

/** Sorts a copy, comparing by each key in turn and falling back to reading order. */
function orderBy(
  icons: readonly AnalysedIcon[],
  keys: ReadonlyArray<(icon: AnalysedIcon) => number>,
): AnalysedIcon[] {
  return [...icons].sort((a, b) => {
    for (const key of keys) {
      const difference = key(a) - key(b);
      if (difference !== 0) return difference;
    }
    return a.index - b.index;
  });
}

function withinGroup(
  group: ColorClass,
  icons: readonly AnalysedIcon[],
  neutralChroma: number,
): AnalysedIcon[] {
  switch (group) {
    case 'chromatic':
      return orderBy(icons, [(icon) => rotateHue(icon.color.dominant.h)]);
    case 'dark': {
      // Hue is meaningless at zero chroma -- a black tile's reported hue is
      // noise -- so near-neutral darks follow the tinted ones, by lightness.
      const hasHue = (icon: AnalysedIcon) => icon.color.dominant.C >= neutralChroma;
      return orderBy(icons, [
        (icon) => (hasHue(icon) ? 0 : 1),
        (icon) => (hasHue(icon) ? rotateHue(icon.color.dominant.h) : 0),
        (icon) => icon.color.dominant.L,
      ]);
    }
    case 'gray':
      return orderBy(icons, [(icon) => icon.color.dominant.L]);
    case 'white':
      // By the colour of the mark on the tile; icons with no accent go last.
      return orderBy(icons, [
        (icon) => (icon.color.accent ? 0 : 1),
        (icon) => (icon.color.accent ? rotateHue(icon.color.accent.h) : 0),
      ]);
  }
}

export function sortIcons(
  icons: readonly AnalysedIcon[],
  options: SortOptions = DEFAULT_SORT_OPTIONS,
): AnalysedIcon[] {
  const neutralChroma = options.neutralChroma ?? DEFAULT_ANALYSIS_OPTIONS.neutralMaxChroma;
  switch (options.mode) {
    case 'rainbow': {
      const groups = options.whiteFirst ? WHITE_FIRST_GROUPS : RAINBOW_GROUPS;
      return groups.flatMap((group) =>
        withinGroup(group, icons.filter((icon) => icon.color.colorClass === group), neutralChroma),
      );
    }
    case 'families': {
      // Same groups as the rainbow; only the chromatic group is ordered
      // differently, because the neutrals have no family to belong to.
      const palette = options.palette ?? fallbackPalette();
      const groups = options.whiteFirst ? WHITE_FIRST_GROUPS : RAINBOW_GROUPS;
      return groups.flatMap((group) => {
        const members = icons.filter((icon) => icon.color.colorClass === group);
        return group === 'chromatic'
          ? byFamily(members, palette)
          : withinGroup(group, members, neutralChroma);
      });
    }
    case 'hue': {
      const chromatic = icons.filter((icon) => icon.color.colorClass === 'chromatic');
      const neutral = icons.filter((icon) => icon.color.colorClass !== 'chromatic');
      return [
        ...orderBy(chromatic, [(icon) => rotateHue(icon.color.dominant.h)]),
        ...orderBy(neutral, [(icon) => icon.color.dominant.L]),
      ];
    }
    case 'dark-to-light':
      return orderBy(icons, [(icon) => icon.color.dominant.L]);
    case 'light-to-dark':
      return orderBy(icons, [(icon) => -icon.color.dominant.L]);
  }
}
