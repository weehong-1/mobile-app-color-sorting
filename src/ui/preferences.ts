/**
 * The handful of choices worth remembering between visits. Only things the
 * person picked: never image data, and nothing derived from a screenshot.
 *
 * Storage can throw or come back empty in a private window or with site data
 * blocked, so every read and write is guarded and the app works without it.
 */
import { type LayoutMode, LAYOUT_MODES } from '../core/layout.ts';
import { type SortMode, SORT_MODES } from '../core/sort.ts';

export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export interface Preferences {
  backgroundHex: string;
  sortMode: SortMode;
  whiteFirst: boolean;
  darkThreshold: number;
  /**
   * How much of a white tile a coloured mark must cover before the icon is
   * read as that mark's colour rather than as a white tile. See ADR-0011.
   */
  markThreshold: number;
  layout: LayoutMode;
  /** A pasted palette, or null for the built-in one. */
  paletteText: string | null;
  showLabels: boolean;
  /** null means pick a colour that contrasts with the background. */
  labelColourHex: string | null;
  theme: Theme;
}

const KEY = 'icon-sorter.preferences.v1';

export const DEFAULT_PREFERENCES: Preferences = {
  backgroundHex: '#f2f2f7',
  // The mode that answers the question people arrive with -- a page of white
  // cards ordered by the logos on them. See `docs/adr/0016`.
  sortMode: 'tile-then-mark',
  whiteFirst: false,
  darkThreshold: 0.32,
  markThreshold: 0.2,
  layout: 'packed',
  paletteText: null,
  showLabels: false,
  labelColourHex: null,
  theme: 'system',
};



export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      backgroundHex: /^#[0-9a-f]{6}$/i.test(parsed.backgroundHex ?? '')
        ? parsed.backgroundHex!
        : DEFAULT_PREFERENCES.backgroundHex,
      sortMode: (SORT_MODES as readonly string[]).includes(parsed.sortMode ?? '')
        ? parsed.sortMode!
        : DEFAULT_PREFERENCES.sortMode,
      whiteFirst: typeof parsed.whiteFirst === 'boolean' ? parsed.whiteFirst : false,
      darkThreshold:
        typeof parsed.darkThreshold === 'number' && parsed.darkThreshold > 0 && parsed.darkThreshold < 1
          ? parsed.darkThreshold
          : DEFAULT_PREFERENCES.darkThreshold,
      markThreshold:
        typeof parsed.markThreshold === 'number' && parsed.markThreshold > 0 && parsed.markThreshold < 1
          ? parsed.markThreshold
          : DEFAULT_PREFERENCES.markThreshold,
      layout: (LAYOUT_MODES as readonly string[]).includes(parsed.layout ?? '')
        ? parsed.layout!
        : DEFAULT_PREFERENCES.layout,
      paletteText:
        typeof parsed.paletteText === 'string' && parsed.paletteText.trim() !== ''
          ? parsed.paletteText
          : null,
      showLabels: typeof parsed.showLabels === 'boolean' ? parsed.showLabels : false,
      labelColourHex: /^#[0-9a-f]{6}$/i.test(parsed.labelColourHex ?? '')
        ? parsed.labelColourHex!
        : null,
      theme: (THEMES as readonly string[]).includes(parsed.theme ?? '') ? parsed.theme! : 'system',
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Nothing to do: preferences are a convenience, not state we depend on.
  }
}
