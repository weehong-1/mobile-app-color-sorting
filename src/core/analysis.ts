/**
 * What colour an icon is.
 *
 * Area wins: the dominant colour is whatever covers most of the icon, so a
 * mostly-navy tile with a thin teal stripe is navy. Two kinds of icon are
 * exempt, both handled by `chromaticTakeover`: a gradient tile, where nothing
 * wins a majority at all, and a white tile carrying a real mark, where the
 * winner is a background rather than a colour. See ADR-0007 and ADR-0011. The
 * accent is the largest
 * well-saturated region that is clearly a different colour, and it exists to
 * order icons whose dominant colours are all the same -- a page of white tiles
 * sorts by the colour of the mark on each one.
 */
import { type Oklab, type Oklch, chroma, labDistance, oklabToOklch, rgbToOklab } from './color.ts';
import type { Sprite } from './sprite.ts';

export type ColorClass = 'chromatic' | 'gray' | 'dark' | 'white';

export interface IconColor {
  readonly dominant: Oklch;
  /** Share of sampled pixels in the dominant cluster, 0 to 1. */
  readonly dominantShare: number;
  readonly accent: Oklch | null;
  readonly accentShare: number;
  readonly colorClass: ColorClass;
  readonly sampleCount: number;
  /**
   * The colour of the tile itself, measured at the icon's rim where nothing is
   * drawn. Unlike the dominant colour it never yields to a mark, so a white
   * card with a red logo has a white tile and a red mark rather than one
   * colour that depends on how big the logo happens to be.
   */
  readonly tile: Oklch;
  readonly tileClass: ColorClass;
  /** What is drawn on the tile, when it is coloured enough to sort by. */
  readonly mark: Oklch | null;
}

export interface AnalysisOptions {
  /** Sample every nth pixel in each direction. */
  readonly sampleStep: number;
  /**
   * Quantiser bin widths. Lightness is binned more coarsely than the colour
   * axes on purpose: shading and gradients move a colour along L while leaving
   * a and b almost unchanged, so a wider L bin keeps one shaded colour together
   * while a narrow a/b bin still separates, say, navy from teal.
   */
  readonly binLightness: number;
  readonly binChroma: number;
  /** A pixel needs this much chroma before it can be an accent. */
  readonly accentMinChroma: number;
  /**
   * ...and the cluster they form must itself be genuinely coloured. A dark
   * navy mark on a white tile scrapes over the per-pixel gate but is not a
   * colour to sort by: it belongs with the black marks, at the end of the white
   * group, rather than among the blues.
   */
  readonly accentMinClusterChroma: number;
  /** ...and must be at least this far from the dominant colour in OKLab. */
  readonly accentMinDistance: number;
  /** ...and its cluster must cover at least this share of the icon. */
  readonly accentMinShare: number;
  /**
   * Area only wins when something actually wins. A tile painted as a gradient
   * has no flat region for the quantiser to find, so its colour is split across
   * dozens of bins and a small flat glyph can take the vote with a fifth of the
   * pixels while four fifths of the icon is plainly coloured. When a neutral
   * winner is outweighed like that -- coloured pixels covering at least
   * `chromaticMinShare` of the icon, and at least `chromaticMinRatio` times as
   * much of it as the winner -- the icon is measured among its coloured pixels
   * instead. Both gates are needed: a white tile with a big coloured mark on it
   * is still a white tile, and it is the ratio that says so.
   */
  readonly chromaticMinShare: number;
  readonly chromaticMinRatio: number;
  /**
   * On a white tile, the mark speaks for the icon once it covers this much of
   * it. A white tile is a background, not a colour anyone chose: the red drop
   * on Donate Blood is what the eye sorts by, and filing that icon with the
   * plain white ones puts it half a page from the red tiles it belongs beside.
   * Below this share the tile wins again, because a small logo is a detail
   * rather than the icon's colour -- and the mark must be genuinely coloured
   * either way, so a dark navy glyph stays a mark on a white tile.
   */
  readonly markMinShare: number;
  readonly whiteMinLightness: number;
  readonly neutralMaxChroma: number;
  /** Adjustable: the cut below which an icon is dark rather than coloured. */
  readonly darkMaxLightness: number;
  /**
   * How much further down the cut reaches for a tile with little colour in it.
   * TNG eWallet is the case: a near-black navy at lightness 0.33 against a cut
   * of 0.32, which filed it among the colours and stood it between Alipay and
   * the white cards. A tile that dark reads as black whatever its hue says.
   *
   * The margin rides the cut rather than sitting at a fixed lightness, so the
   * one dial the interface offers still governs how dark "dark" is. The chroma
   * gate is what keeps it honest: a genuinely vivid deep tile -- a royal purple
   * at lightness 0.40, chroma 0.25 -- is a colour someone chose, and only the
   * muted ones are swept up. See `docs/adr/0015`.
   */
  readonly mutedDarkMargin: number;
  readonly mutedDarkMaxChroma: number;
  /**
   * How far in from the icon's edge the tile is read, as a fraction of the
   * icon square. Wide enough to survive a logo that reaches towards a corner,
   * narrow enough that a centred mark never reaches it.
   */
  readonly tileRingFraction: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  sampleStep: 2,
  binLightness: 0.06,
  binChroma: 0.02,
  accentMinChroma: 0.06,
  accentMinClusterChroma: 0.11,
  accentMinDistance: 0.15,
  accentMinShare: 0.015,
  chromaticMinShare: 0.5,
  chromaticMinRatio: 2,
  markMinShare: 0.2,
  whiteMinLightness: 0.9,
  neutralMaxChroma: 0.04,
  darkMaxLightness: 0.32,
  mutedDarkMargin: 0.1,
  mutedDarkMaxChroma: 0.15,
  tileRingFraction: 0.12,
};

interface Bin {
  count: number;
  L: number;
  a: number;
  b: number;
}

/**
 * The heaviest 3x3x3 neighbourhood of bins, averaged. Taking a neighbourhood
 * rather than a single bin stops an arbitrary bin boundary from splitting one
 * colour in half and handing the win to a smaller, luckier one.
 */
function heaviestCluster(
  samples: readonly Oklab[],
  options: AnalysisOptions,
): { color: Oklab; count: number } | null {
  if (samples.length === 0) return null;

  const bins = new Map<string, Bin>();
  for (const sample of samples) {
    const key = `${Math.floor(sample.L / options.binLightness)},${Math.floor(sample.a / options.binChroma)},${Math.floor(sample.b / options.binChroma)}`;
    const bin = bins.get(key);
    if (bin) {
      bin.count++; bin.L += sample.L; bin.a += sample.a; bin.b += sample.b;
    } else {
      bins.set(key, { count: 1, L: sample.L, a: sample.a, b: sample.b });
    }
  }

  const around = (key: string): { count: number; L: number; a: number; b: number } => {
    const [i, j, k] = key.split(',').map(Number) as [number, number, number];
    let count = 0, L = 0, a = 0, b = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let dk = -1; dk <= 1; dk++) {
          const bin = bins.get(`${i + di},${j + dj},${k + dk}`);
          if (!bin) continue;
          count += bin.count; L += bin.L; a += bin.a; b += bin.b;
        }
      }
    }
    return { count, L, a, b };
  };

  let best: { count: number; L: number; a: number; b: number } | null = null;
  for (const key of bins.keys()) {
    const cluster = around(key);
    if (!best || cluster.count > best.count) best = cluster;
  }
  if (!best) return null;
  return {
    color: { L: best.L / best.count, a: best.a / best.count, b: best.b / best.count },
    count: best.count,
  };
}

/**
 * The icon's colour measured among its coloured pixels alone, for the two cases
 * where a neutral winner does not deserve the icon: a gradient tile, where the
 * winner is a minority the quantiser handed the vote to, and a white tile,
 * where the winner is a background and the mark on it is the colour. Null when
 * the winner deserves the icon, which is the usual case.
 */
function chromaticTakeover(
  samples: readonly Oklab[],
  winner: { color: Oklab; count: number },
  options: AnalysisOptions,
): { color: Oklab; count: number } | null {
  if (chroma(winner.color) > options.neutralMaxChroma) return null;

  const colored = samples.filter((sample) => chroma(sample) >= options.accentMinChroma);
  const shattered =
    colored.length >= options.chromaticMinShare * samples.length &&
    colored.length >= options.chromaticMinRatio * winner.count;
  const onWhiteTile = winner.color.L >= options.whiteMinLightness;
  if (!shattered && !onWhiteTile) return null;

  const cluster = heaviestCluster(colored, options);
  if (!cluster || chroma(cluster.color) < options.accentMinClusterChroma) return null;
  if (!shattered && cluster.count < options.markMinShare * samples.length) return null;
  return cluster;
}

function classify(dominant: Oklch, options: AnalysisOptions): ColorClass {
  if (dominant.L >= options.whiteMinLightness && dominant.C <= options.neutralMaxChroma) return 'white';
  if (dominant.L <= options.darkMaxLightness) return 'dark';
  // ...and a little further down for anything too muted to read as a colour.
  if (
    dominant.L <= options.darkMaxLightness + options.mutedDarkMargin &&
    dominant.C <= options.mutedDarkMaxChroma
  ) {
    return 'dark';
  }
  if (dominant.C <= options.neutralMaxChroma) return 'gray';
  return 'chromatic';
}

/** Pixels fully inside the icon mask, skipping the badge and the antialiased rim. */
export function sampleSprite(sprite: Sprite, options: AnalysisOptions): Oklab[] {
  const { bounds, mask, pixels, badge, space } = sprite;
  const samples: Oklab[] = [];
  for (let y = 0; y < bounds.height; y += options.sampleStep) {
    for (let x = 0; x < bounds.width; x += options.sampleStep) {
      if (mask[y * bounds.width + x]! < 1) continue;
      if (badge) {
        const sx = bounds.x + x;
        const sy = bounds.y + y;
        if (sx >= badge.x && sx < badge.x + badge.width && sy >= badge.y && sy < badge.y + badge.height) {
          continue;
        }
      }
      const i = (y * bounds.width + x) * 4;
      samples.push(rgbToOklab(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, space));
    }
  }
  return samples;
}

/**
 * Pixels in the band just inside the icon's edge: the tile, with whatever is
 * drawn in the middle left out. The mask has already dropped the rounded
 * corners and the antialiased rim, so this is the tile's own colour.
 */
export function sampleRing(sprite: Sprite, options: AnalysisOptions): Oklab[] {
  const { bounds, iconRect, mask, pixels, badge, space } = sprite;
  const left = iconRect.x - bounds.x;
  const top = iconRect.y - bounds.y;
  const band = Math.max(1, Math.round(options.tileRingFraction * Math.min(iconRect.width, iconRect.height)));
  const samples: Oklab[] = [];

  for (let y = 0; y < bounds.height; y += options.sampleStep) {
    for (let x = 0; x < bounds.width; x += options.sampleStep) {
      if (mask[y * bounds.width + x]! < 1) continue;
      const ix = x - left;
      const iy = y - top;
      if (ix < 0 || iy < 0 || ix >= iconRect.width || iy >= iconRect.height) continue;
      if (Math.min(ix, iy, iconRect.width - 1 - ix, iconRect.height - 1 - iy) > band) continue;
      if (badge) {
        const sx = bounds.x + x;
        const sy = bounds.y + y;
        if (sx >= badge.x && sx < badge.x + badge.width && sy >= badge.y && sy < badge.y + badge.height) {
          continue;
        }
      }
      const i = (y * bounds.width + x) * 4;
      samples.push(rgbToOklab(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, space));
    }
  }
  return samples;
}

export function analyseSprite(
  sprite: Sprite,
  options: AnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): IconColor {
  const samples = sampleSprite(sprite, options);
  const winner = heaviestCluster(samples, options);
  if (!winner) {
    const black: Oklch = { L: 0, C: 0, h: 0 };
    return {
      dominant: black, dominantShare: 0, accent: null, accentShare: 0,
      colorClass: 'dark', sampleCount: 0, tile: black, tileClass: 'dark', mark: null,
    };
  }

  const dominantCluster = chromaticTakeover(samples, winner, options) ?? winner;
  const dominant = oklabToOklch(dominantCluster.color);
  const candidates = samples.filter(
    (sample) =>
      chroma(sample) >= options.accentMinChroma &&
      labDistance(sample, dominantCluster.color) >= options.accentMinDistance,
  );
  const accentCluster = heaviestCluster(candidates, options);
  const accentShare = accentCluster ? accentCluster.count / samples.length : 0;
  const accent =
    accentCluster &&
    accentShare >= options.accentMinShare &&
    chroma(accentCluster.color) >= options.accentMinClusterChroma
      ? oklabToOklch(accentCluster.color)
      : null;

  // The tile and the mark are measured against each other rather than against
  // the dominant colour, which may already have yielded to the mark (ADR-0011).
  const ringCluster = heaviestCluster(sampleRing(sprite, options), options);
  const tileLab = ringCluster ? ringCluster.color : dominantCluster.color;
  const marks = samples.filter(
    (sample) =>
      chroma(sample) >= options.accentMinChroma &&
      labDistance(sample, tileLab) >= options.accentMinDistance,
  );
  const markCluster = heaviestCluster(marks, options);
  const markShare = markCluster ? markCluster.count / samples.length : 0;
  const tile = oklabToOklch(tileLab);

  return {
    dominant,
    dominantShare: dominantCluster.count / samples.length,
    accent,
    accentShare: accent ? accentShare : 0,
    colorClass: classify(dominant, options),
    sampleCount: samples.length,
    tile,
    tileClass: classify(tile, options),
    mark:
      markCluster &&
      markShare >= options.accentMinShare &&
      chroma(markCluster.color) >= options.accentMinClusterChroma
        ? oklabToOklch(markCluster.color)
        : null,
  };
}
