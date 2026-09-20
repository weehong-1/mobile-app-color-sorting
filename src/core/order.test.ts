/**
 * The agreed default order, from docs/acceptance-criteria.md.
 *
 * Groups and membership are asserted outright. The sequence within them is
 * computed, diffed against the expected list and reported with hues rather than
 * hard-failed, because a swap between two icons whose hues differ by a couple
 * of degrees is a judgement call, not a regression.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE_OPTIONS, analyseScreenshot } from './pipeline.ts';
import { rotateHue } from './sort.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import truthDense from '../../fixtures/IMG_0571.truth.json' with { type: 'json' };
import truthSparse from '../../fixtures/IMG_0572.truth.json' with { type: 'json' };

const EXPECTED_DENSE = [
  'Youdao', 'Claude', 'WhatsApp', 'WeChat', 'Spark',
  '1Password',
  'VoiceRecorder',
  'Gmail', 'Owlfiles', 'Telegram', 'Gemini', 'UpNote', 'Simplenote', 'DeepSeek', 'DeepL', 'ChatGPT',
];

const EXPECTED_SPARSE = [
  'Meitu', 'Todoist',
  'Endel', 'Spotify',
  '轻颜', 'QQMusic', 'TickTick', 'MinimaList',
];

describe.each([
  ['dense', FIXTURES.dense, truthDense, EXPECTED_DENSE],
  ['sparse', FIXTURES.sparse, truthSparse, EXPECTED_SPARSE],
] as const)('default rainbow order on the %s fixture', (name, path, truth, expected) => {
  const analysed = analyseScreenshot(readPng(path), DEFAULT_PIPELINE_OPTIONS);
  const named = analysed.order.map((icon) => ({
    name: truth.icons[icon.index]!.name,
    colorClass: icon.color.colorClass,
    color: icon.color,
  }));
  const actual = named.map((icon) => icon.name);

  it('sorts every icon exactly once', () => {
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it('puts the groups in order, with no group interleaved', () => {
    const groups = named.map((icon) => icon.colorClass);
    const firstSeen = [...new Set(groups)];
    expect(groups).toEqual(firstSeen.flatMap((group) => groups.filter((g) => g === group)));
    expect(firstSeen).toEqual(
      ['chromatic', 'gray', 'dark', 'white'].filter((group) => firstSeen.includes(group as never)),
    );
  });

  it('puts icons with no accent at the end of the white group', () => {
    const whites = named.filter((icon) => icon.colorClass === 'white');
    const withoutAccent = whites.findIndex((icon) => icon.color.accent === null);
    if (withoutAccent === -1) return;
    expect(whites.slice(withoutAccent).every((icon) => icon.color.accent === null)).toBe(true);
  });

  it('matches the agreed order, reporting any difference', () => {
    if (actual.join() === expected.join()) return;
    const report = named
      .map((icon, position) => {
        const key =
          icon.color.accent !== null && icon.colorClass === 'white'
            ? `accent hue ${icon.color.accent.h.toFixed(1)} (rot ${rotateHue(icon.color.accent.h).toFixed(1)})`
            : `hue ${icon.color.dominant.h.toFixed(1)} chroma ${icon.color.dominant.C.toFixed(3)} L ${icon.color.dominant.L.toFixed(3)}`;
        const was = expected[position];
        return `${String(position + 1).padStart(3)}. ${icon.name.padEnd(14)} expected ${String(was).padEnd(14)} ${key}`;
      })
      .join('\n');
    throw new Error(`${name} order differs from the agreed list:\n${report}`);
  });
});

/**
 * The 'families' mode keeps the same groups and the same neutral rules; only
 * the chromatic group is ordered differently. Asserting the chromatic run is
 * enough to pin the behaviour, and it is short enough to assert exactly.
 */
describe.each([
  ['dense', FIXTURES.dense, truthDense, ['Claude', 'Youdao', 'WhatsApp', 'WeChat', 'Spark']],
  ['sparse', FIXTURES.sparse, truthSparse, ['Todoist', 'Meitu']],
] as const)('colour families order on the %s fixture', (_name, path, truth, expectedChromatic) => {
  const options = {
    ...DEFAULT_PIPELINE_OPTIONS,
    sort: { mode: 'families' as const, whiteFirst: false },
  };
  const analysed = analyseScreenshot(readPng(path), options);
  const named = analysed.order.map((icon) => ({
    name: truth.icons[icon.index]!.name,
    colorClass: icon.color.colorClass,
    L: icon.color.dominant.L,
  }));

  it('orders the chromatic icons by family, then pale to deep', () => {
    const chromatic = named.filter((icon) => icon.colorClass === 'chromatic').map((i) => i.name);
    expect(chromatic).toEqual([...expectedChromatic]);
  });

  it('runs pale before deep inside a family', () => {
    // Both fixtures have a family holding two icons; the paler must lead.
    const chromatic = named.filter((icon) => icon.colorClass === 'chromatic');
    expect(chromatic[0]!.L).toBeGreaterThan(chromatic[1]!.L);
  });

  it('leaves the neutral part of the order identical to the rainbow', () => {
    const rainbow = analyseScreenshot(readPng(path), DEFAULT_PIPELINE_OPTIONS);
    const neutralsOf = (screenshot: typeof analysed) =>
      screenshot.order
        .filter((icon) => icon.color.colorClass !== 'chromatic')
        .map((icon) => truth.icons[icon.index]!.name);
    expect(neutralsOf(analysed)).toEqual(neutralsOf(rainbow));
  });

  it('sorts every icon exactly once', () => {
    expect(named).toHaveLength(truth.icons.length);
    expect(new Set(named.map((i) => i.name)).size).toBe(truth.icons.length);
  });
});
