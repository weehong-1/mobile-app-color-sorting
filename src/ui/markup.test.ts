/**
 * The interface offers choices that also exist as unions in the core modules.
 * The union and its validation list are now the same list, but the markup is a
 * third copy that nothing type-checks -- and it was a missing entry in one of
 * these lists that let a saved sort mode silently revert.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAYOUT_MODES } from '../core/layout.ts';
import { SORT_MODES } from '../core/sort.ts';
import { THEMES } from './preferences.ts';

const html = readFileSync('index.html', 'utf8');

function optionValues(selectId: string): string[] {
  const select = new RegExp(`<select id="${selectId}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  if (!select) throw new Error(`No <select id="${selectId}"> in index.html`);
  return [...select[1]!.matchAll(/value="([^"]+)"/g)].map((match) => match[1]!);
}

function radioValues(name: string): string[] {
  return [...html.matchAll(new RegExp(`<input type="radio" name="${name}" value="([^"]+)"`, 'g'))]
    .map((match) => match[1]!);
}

describe('index.html offers exactly the choices the code defines', () => {
  it('lists every sort mode', () => {
    expect(optionValues('sort-mode').sort()).toEqual([...SORT_MODES].sort());
  });

  it('lists every layout', () => {
    expect(radioValues('layout').sort()).toEqual([...LAYOUT_MODES].sort());
  });

  it('lists every theme', () => {
    expect(optionValues('theme').sort()).toEqual([...THEMES].sort());
  });
});
