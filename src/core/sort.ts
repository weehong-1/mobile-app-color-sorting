/**
 * Putting icons in order.
 *
 * Hues are rotated before comparison so the rainbow starts near pink rather
 * than at an arbitrary red: pinks lead, then reds, oranges, greens, blues and
 * violets. The neutrals follow as one ramp, white through gray to black, so
 * that a light grey tile sits with the whites it resembles rather than among
 * the colours. Every mode is a stable sort over the icons' reading order, so two
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
export const SORT_MODES = [
  'rainbow',
  'families',
  'tile-then-mark',
  'hue',
  'dark-to-light',
  'light-to-dark',
] as const;

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

/**
 * 'tile-then-mark' rather than 'rainbow' since 2026-09-21: the order the app
 * opens on is the one that sorts a page of white cards by the logos drawn on
 * them, which is the question people arrive with. See `docs/adr/0016`.
 */
export const DEFAULT_SORT_OPTIONS: SortOptions = { mode: 'tile-then-mark', whiteFirst: false };

/**
 * Where the rainbow begins, in OKLCH degrees. A constant rather than a control:
 * it decides what "the default order" means, and a dial would let people
 * produce orders that do not start with pinks.
 */
export const HUE_ANCHOR = 345;

export function rotateHue(hue: number, anchor: number = HUE_ANCHOR): number {
  return ((hue - anchor) % 360 + 360) % 360;
}

/**
 * How wide a band of hue counts as one colour, in degrees.
 *
 * Ordering marks by hue alone rests on differences nobody can see: the four red
 * logos on the reference page measure 40.95, 41.05, 43.38 and 44.53 degrees,
 * and a lightness key placed after hue never runs, because no two of those are
 * equal. Banding them makes one red of the four and lets lightness do the
 * visible work.
 */
export const HUE_BAND = 15;

/** Which band a hue falls in, counted from the anchor. */
export function hueBand(hue: number, anchor: number = HUE_ANCHOR): number {
  return Math.floor(rotateHue(hue, anchor) / HUE_BAND);
}

export interface AnalysedIcon {
  /** Position in the original screenshot's reading order. */
  readonly index: number;
  readonly color: IconColor;
}

/**
 * Colours first, then the neutrals as one continuous ramp from white through
 * gray to black. The neutrals used to be split -- gray, dark, then white last
 * -- which put a silver tile in the middle of the blues and left the white
 * tiles stranded after the blacks. Nothing was misclassified when that
 * happened; a light grey icon simply has nowhere to sit unless the neutrals are
 * kept together.
 */
const RAINBOW_GROUPS: readonly ColorClass[] = ['chromatic', 'white', 'gray', 'dark'];

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
/** The same ramp, led by its white end rather than trailed by its black one. */
const WHITE_FIRST_GROUPS: readonly ColorClass[] = ['white', 'gray', 'dark', 'chromatic'];

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
      // Pale to deep, continuing the ramp down from the white group.
      return orderBy(icons, [(icon) => -icon.color.dominant.L]);
    case 'white':
      // By the colour of the mark on the tile, a band of hue at a time and pale
      // to deep inside a band; icons with no accent go last.
      return orderBy(icons, [
        (icon) => (icon.color.accent ? 0 : 1),
        (icon) => (icon.color.accent ? hueBand(icon.color.accent.h) : 0),
        (icon) => (icon.color.accent ? -icon.color.accent.L : 0),
      ]);
  }
}

/**
 * Grouped by the tile an icon sits on, and ordered inside that group by the
 * mark drawn on it.
 *
 * The rainbow asks one question of an icon -- what colour is it? -- and a white
 * card with a red logo has no honest answer: the tile says white, the logo says
 * red, and which one wins comes down to a threshold nobody agrees on. This mode
 * declines the question. The tile groups, the mark orders, and both keep their
 * own colour, so every white card sits with the other white cards and runs red
 * through blue by the thing drawn on it.
 *
 * Within a chromatic tile group the tile's own hue already orders them, so the
 * mark only breaks ties. Within the neutral groups the mark does the work,
 * since a page of white tiles is otherwise unsorted.
 */
function withinTileGroup(
  group: ColorClass,
  icons: readonly AnalysedIcon[],
  neutralChroma: number,
): AnalysedIcon[] {
  const marked = (icon: AnalysedIcon) => (icon.color.mark ? 0 : 1);
  const markHue = (icon: AnalysedIcon) => (icon.color.mark ? rotateHue(icon.color.mark.h) : 0);

  if (group === 'chromatic') {
    return orderBy(icons, [
      (icon) => rotateHue(icon.color.tile.h),
      marked,
      markHue,
      (icon) => -icon.color.tile.L,
    ]);
  }
  // Near-neutral tiles have no hue worth sorting by, so the mark leads: a band
  // of mark hue at a time, pale to deep inside a band, and the tile's own
  // lightness continuing the ramp for anything that carries no mark at all.
  return orderBy(icons, [
    marked,
    (icon) => (icon.color.mark ? hueBand(icon.color.mark.h) : 0),
    (icon) => (icon.color.mark ? -icon.color.mark.L : 0),
    (icon) => (icon.color.tile.C >= neutralChroma ? rotateHue(icon.color.tile.h) : 0),
    (icon) => -icon.color.tile.L,
  ]);
}

/** The rainbow: groups in order, each group ordered by its own rule. */
function withinGroupOrder(
  icons: readonly AnalysedIcon[],
  options: SortOptions,
  neutralChroma: number,
): AnalysedIcon[] {
  const groups = options.whiteFirst ? WHITE_FIRST_GROUPS : RAINBOW_GROUPS;
  return groups.flatMap((group) =>
    withinGroup(group, icons.filter((icon) => icon.color.colorClass === group), neutralChroma),
  );
}

export function sortIcons(
  icons: readonly AnalysedIcon[],
  options: SortOptions = DEFAULT_SORT_OPTIONS,
): AnalysedIcon[] {
  const neutralChroma = options.neutralChroma ?? DEFAULT_ANALYSIS_OPTIONS.neutralMaxChroma;
  switch (options.mode) {
    case 'rainbow':
      return withinGroupOrder(icons, options, neutralChroma);
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
    case 'tile-then-mark': {
      const groups = options.whiteFirst ? WHITE_FIRST_GROUPS : RAINBOW_GROUPS;
      return groups.flatMap((group) =>
        withinTileGroup(group, icons.filter((icon) => icon.color.tileClass === group), neutralChroma),
      );
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
