import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAYOUT_MODES } from '../core/layout.ts';
import { SORT_MODES } from '../core/sort.ts';
import { DEFAULT_PREFERENCES, THEMES, loadPreferences, savePreferences } from './preferences.ts';

/** A minimal in-memory Storage, since these tests run under Node. */
function fakeStorage(): Storage & { fail: boolean } {
  const entries = new Map<string, string>();
  return {
    fail: false,
    get length() { return entries.size; },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem(key) { if (this.fail) throw new Error('blocked'); return entries.get(key) ?? null; },
    setItem(key, value) { if (this.fail) throw new Error('blocked'); entries.set(key, String(value)); },
    removeItem: (key) => { entries.delete(key); },
    clear: () => entries.clear(),
  } as Storage & { fail: boolean };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('preferences round trip', () => {
  /**
   * ADR-0016. A saved preference still wins: someone who chose the rainbow
   * before today keeps it, and only a fresh browser sees the new default.
   */
  it('opens on tile, then mark', () => {
    expect(DEFAULT_PREFERENCES.sortMode).toBe('tile-then-mark');
    savePreferences({ ...DEFAULT_PREFERENCES, sortMode: 'rainbow' });
    expect(loadPreferences().sortMode).toBe('rainbow');
  });

  /**
   * The regression this file exists for: 'families' was missing from the list
   * of valid sort modes, so choosing it and reloading silently reverted to
   * rainbow, taking the palette panel with it. The list is typed from the union
   * now, but a test is cheaper to read than the type.
   */
  it.each(SORT_MODES)('keeps the %s sort mode', (sortMode) => {
    savePreferences({ ...DEFAULT_PREFERENCES, sortMode });
    expect(loadPreferences().sortMode).toBe(sortMode);
  });

  it.each(LAYOUT_MODES)('keeps the %s layout', (layout) => {
    savePreferences({ ...DEFAULT_PREFERENCES, layout });
    expect(loadPreferences().layout).toBe(layout);
  });

  it.each(THEMES)('keeps the %s theme', (theme) => {
    savePreferences({ ...DEFAULT_PREFERENCES, theme });
    expect(loadPreferences().theme).toBe(theme);
  });

  it('keeps a pasted palette', () => {
    const paletteText = '#1b4f9c Deep blue\n#e8c34a Yellow';
    savePreferences({ ...DEFAULT_PREFERENCES, paletteText });
    expect(loadPreferences().paletteText).toBe(paletteText);
  });

  it('keeps the remaining settings', () => {
    const wanted = {
      ...DEFAULT_PREFERENCES,
      backgroundHex: '#123456',
      whiteFirst: true,
      darkThreshold: 0.41,
      markThreshold: 0.35,
      showLabels: true,
      labelColourHex: '#abcdef',
    };
    savePreferences(wanted);
    expect(loadPreferences()).toEqual(wanted);
  });
});

describe('preferences validation', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it.each([
    ['sortMode', 'nonsense'],
    ['layout', 'sideways'],
    ['theme', 'neon'],
    ['backgroundHex', 'not-a-colour'],
    ['darkThreshold', 5],
    ['labelColourHex', 'nope'],
  ] as const)('falls back to the default for a bad %s', (key, value) => {
    storage.setItem('icon-sorter.preferences.v1', JSON.stringify({ ...DEFAULT_PREFERENCES, [key]: value }));
    const loaded = loadPreferences();
    expect(loaded[key]).toEqual(DEFAULT_PREFERENCES[key]);
  });

  it('treats an empty pasted palette as none', () => {
    storage.setItem('icon-sorter.preferences.v1', JSON.stringify({ paletteText: '   ' }));
    expect(loadPreferences().paletteText).toBeNull();
  });

  it('survives unparseable stored data', () => {
    storage.setItem('icon-sorter.preferences.v1', '{not json');
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  /** Storage can be blocked entirely; preferences are a convenience, not state. */
  it('survives storage that throws', () => {
    storage.fail = true;
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(DEFAULT_PREFERENCES)).not.toThrow();
  });
});
