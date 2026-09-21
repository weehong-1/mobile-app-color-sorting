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
import { hueBand, rotateHue } from './sort.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import truthDense from '../../fixtures/IMG_0571.truth.json' with { type: 'json' };
import truthSparse from '../../fixtures/IMG_0572.truth.json' with { type: 'json' };
import truthFlat from '../../fixtures/IMG_0910.truth.json' with { type: 'json' };

const EXPECTED_DENSE = [
  'Youdao', 'Claude', 'WhatsApp', 'WeChat', 'Telegram', 'Spark', 'Simplenote', 'DeepSeek',
  'Gmail', 'Owlfiles', 'Gemini', 'UpNote', 'DeepL', 'ChatGPT',
  '1Password',
  'VoiceRecorder',
];

const EXPECTED_SPARSE = [
  'Meitu', 'Todoist', 'QQMusic',
  '轻颜', 'TickTick', 'MinimaList',
  'Endel', 'Spotify',
];

describe.each([
  ['dense', FIXTURES.dense, truthDense, EXPECTED_DENSE],
  ['sparse', FIXTURES.sparse, truthSparse, EXPECTED_SPARSE],
] as const)('rainbow order on the %s fixture', (name, path, truth, expected) => {
  // Explicit since 2026-09-21: 'tile-then-mark' is what the pipeline defaults
  // to now, and criteria 4 and 4b are written against the rainbow.
  const analysed = analyseScreenshot(readPng(path), {
    ...DEFAULT_PIPELINE_OPTIONS,
    sort: { mode: 'rainbow', whiteFirst: false },
  });
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
      ['chromatic', 'white', 'gray', 'dark'].filter((group) => firstSeen.includes(group as never)),
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
  ['dense', FIXTURES.dense, truthDense,
    ['Claude', 'Youdao', 'WhatsApp', 'WeChat', 'Telegram', 'Spark', 'DeepSeek', 'Simplenote']],
  ['sparse', FIXTURES.sparse, truthSparse, ['Todoist', 'Meitu', 'QQMusic']],
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
    const rainbow = analyseScreenshot(readPng(path), {
      ...DEFAULT_PIPELINE_OPTIONS,
      sort: { mode: 'rainbow' as const, whiteFirst: false },
    });
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

/**
 * Criterion 4d: the default order, on the screenshot it was built for.
 *
 * The tile decides the group and the mark decides the sequence inside it, so
 * this is asserted against tileClass rather than the icon's own colour: Donate
 * Blood is a red icon on a white card, and it belongs with the cards.
 */
const EXPECTED_FLAT = [
  'AIA+', 'MySingtel', 'OCBC Business', 'OCBC', 'Singpass', 'Maxis', 'CPF Mobile', 'Alipay',
  'Donate Blood', 'Great Eastern', 'Healthy 365', 'MyPB',
  'MyNIISe',
  '中国移动', 'Authenticator', 'SC Mobile',
  'SP', 'MyICA Mobile',
  'DBS digibank', 'DBS PayLah!', 'TNG eWallet',
];

describe('tile, then mark: the default order on the flat fixture', () => {
  const analysed = analyseScreenshot(readPng(FIXTURES.flat), DEFAULT_PIPELINE_OPTIONS);
  const named = analysed.order.map((icon) => ({
    name: truthFlat.icons[icon.index]!.name,
    tileClass: icon.color.tileClass,
    color: icon.color,
  }));
  const actual = named.map((icon) => icon.name);

  it('is what the pipeline does by default, without being asked', () => {
    expect(DEFAULT_PIPELINE_OPTIONS.sort.mode).toBe('tile-then-mark');
  });

  it('sorts every icon exactly once', () => {
    expect([...actual].sort()).toEqual([...EXPECTED_FLAT].sort());
  });

  it('groups by tile, with no group interleaved', () => {
    const groups = named.map((icon) => icon.tileClass);
    const firstSeen = [...new Set(groups)];
    expect(groups).toEqual(firstSeen.flatMap((group) => groups.filter((g) => g === group)));
    expect(firstSeen).toEqual(['chromatic', 'white', 'dark']);
  });

  /** ADR-0015: a near-black navy is a dark tile, not a colour. */
  it('files TNG eWallet with the dark tiles', () => {
    const tng = named.find((icon) => icon.name === 'TNG eWallet')!;
    expect(tng.tileClass).toBe('dark');
    expect(tng.color.tile.L).toBeGreaterThan(DEFAULT_PIPELINE_OPTIONS.analysis.darkMaxLightness);
  });

  /** The four red logos, one band of hue, ordered pale to deep. */
  it('runs the red-marked cards pale to deep', () => {
    const reds = ['Donate Blood', 'Great Eastern', 'Healthy 365', 'MyPB'].map(
      (name) => named.find((icon) => icon.name === name)!.color.mark!.L,
    );
    expect(reds).toEqual([...reds].sort((a, b) => b - a));
  });

  it('leaves the cards with no mark at the end of the white group', () => {
    const whites = named.filter((icon) => icon.tileClass === 'white');
    const withoutMark = whites.findIndex((icon) => icon.color.mark === null);
    expect(withoutMark).toBeGreaterThan(-1);
    expect(whites.slice(withoutMark).every((icon) => icon.color.mark === null)).toBe(true);
  });

  it('matches the agreed order, reporting any difference', () => {
    if (actual.join() === EXPECTED_FLAT.join()) return;
    const report = named
      .map((icon, position) => {
        const mark = icon.color.mark;
        const key = mark
          ? `mark rot ${rotateHue(mark.h).toFixed(1)} band ${hueBand(mark.h)} L ${mark.L.toFixed(3)}`
          : `no mark, tile L ${icon.color.tile.L.toFixed(3)}`;
        return `${String(position + 1).padStart(3)}. ${icon.name.padEnd(14)} expected ${String(EXPECTED_FLAT[position]).padEnd(14)} ${key}`;
      })
      .join('\n');
    throw new Error(`flat order differs from the agreed list:\n${report}`);
  });
});
