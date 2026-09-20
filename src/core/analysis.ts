/**
 * What colour an icon is.
 *
 * Area wins: the dominant colour is whatever covers most of the icon, so a
 * mostly-navy tile with a thin teal stripe is navy. The accent is the largest
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
  readonly whiteMinLightness: number;
  readonly neutralMaxChroma: number;
  /** Adjustable: the cut below which an icon is dark rather than coloured. */
  readonly darkMaxLightness: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  sampleStep: 2,
  binLightness: 0.06,
  binChroma: 0.02,
  accentMinChroma: 0.06,
  accentMinClusterChroma: 0.11,
  accentMinDistance: 0.15,
  accentMinShare: 0.015,
  whiteMinLightness: 0.9,
  neutralMaxChroma: 0.04,
  darkMaxLightness: 0.32,
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

function classify(dominant: Oklch, options: AnalysisOptions): ColorClass {
  if (dominant.L >= options.whiteMinLightness && dominant.C <= options.neutralMaxChroma) return 'white';
  if (dominant.L <= options.darkMaxLightness) return 'dark';
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

export function analyseSprite(
  sprite: Sprite,
  options: AnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): IconColor {
  const samples = sampleSprite(sprite, options);
  const dominantCluster = heaviestCluster(samples, options);
  if (!dominantCluster) {
    const black: Oklch = { L: 0, C: 0, h: 0 };
    return { dominant: black, dominantShare: 0, accent: null, accentShare: 0, colorClass: 'dark', sampleCount: 0 };
  }

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

  return {
    dominant,
    dominantShare: dominantCluster.count / samples.length,
    accent,
    accentShare: accent ? accentShare : 0,
    colorClass: classify(dominant, options),
    sampleCount: samples.length,
  };
}
