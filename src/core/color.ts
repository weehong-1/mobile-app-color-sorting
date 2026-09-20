/**
 * OKLab / OKLCH conversion, parameterised by working colour space.
 *
 * iPhone screenshots are tagged Display P3 (see ADR-0004), so the pipeline works
 * in P3 by default. OKLab itself is defined against XYZ, so only the RGB-to-XYZ
 * step differs between spaces; the LMS-to-Lab matrix is shared. Every inverse is
 * derived numerically from its forward matrix so there is exactly one place a
 * transcription error could live.
 *
 * Both Display P3 and sRGB use the sRGB transfer function, so decoding is shared.
 */
import { type Mat3, apply, invert, multiply } from './matrix.ts';

export type ColorSpace = 'srgb' | 'display-p3';

export interface Oklab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface Oklch {
  readonly L: number;
  readonly C: number;
  /** Degrees, 0 to 360. Meaningless at very low chroma. */
  readonly h: number;
}

// Linear RGB to XYZ (D65). Both spaces share the D65 white point.
const XYZ_FROM_LINEAR_SRGB: Mat3 = [
  0.4123907992659595, 0.35758433938387796, 0.1804807884018343,
  0.2126390058715104, 0.715168678767756, 0.07219231536073371,
  0.01933081871559182, 0.11919477979462599, 0.9505321522496607,
];

const XYZ_FROM_LINEAR_P3: Mat3 = [
  0.4865709486482162, 0.26566769316909306, 0.1982172852343625,
  0.2289745640697488, 0.6917385218365064, 0.079286914093745,
  0.0, 0.04511338185890264, 1.043944368900976,
];

// XYZ (D65) to the cone responses OKLab is built on.
const LMS_FROM_XYZ: Mat3 = [
  0.8190224379967030, 0.3619062600528904, -0.1288737815209879,
  0.0329836539323885, 0.9292868615863434, 0.0361446663506424,
  0.0481771893596242, 0.2642395317527308, 0.6335478284694309,
];

// Non-linear LMS to Lab. Independent of the source gamut.
const LAB_FROM_LMS: Mat3 = [
  0.2104542683093140, 0.7936177747023054, -0.0040720430116193,
  1.9779985324311684, -2.4285922420485799, 0.4505937096174110,
  0.0259040424655478, 0.7827717124575296, -0.8086757549230774,
];

const LMS_FROM_LAB = invert(LAB_FROM_LMS);

interface SpaceTransforms {
  readonly lmsFromLinear: Mat3;
  readonly linearFromLms: Mat3;
}

const TRANSFORMS: Record<ColorSpace, SpaceTransforms> = {
  srgb: buildTransforms(XYZ_FROM_LINEAR_SRGB),
  'display-p3': buildTransforms(XYZ_FROM_LINEAR_P3),
};

function buildTransforms(xyzFromLinear: Mat3): SpaceTransforms {
  const lmsFromLinear = multiply(LMS_FROM_XYZ, xyzFromLinear);
  return { lmsFromLinear, linearFromLms: invert(lmsFromLinear) };
}

/** Exposed so tests can check the derivation against published constants. */
export function transformsFor(space: ColorSpace): SpaceTransforms {
  return TRANSFORMS[space];
}

/**
 * sRGB transfer function, shared by both spaces. Encoded 0-255 to linear 0-1,
 * via a lookup table because every pixel in the pipeline goes through it.
 */
const LINEAR_FROM_ENCODED = (() => {
  const table = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return table;
})();

export function decodeChannel(encoded: number): number {
  return LINEAR_FROM_ENCODED[encoded]!;
}

export function encodeChannel(linear: number): number {
  const c =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

const cbrt = Math.cbrt;

/** Encoded 0-255 channels to OKLab. */
export function rgbToOklab(r: number, g: number, b: number, space: ColorSpace): Oklab {
  const m = TRANSFORMS[space].lmsFromLinear;
  const lr = LINEAR_FROM_ENCODED[r]!;
  const lg = LINEAR_FROM_ENCODED[g]!;
  const lb = LINEAR_FROM_ENCODED[b]!;
  const [l, mm, s] = apply(m, lr, lg, lb);
  const [L, A, B] = apply(LAB_FROM_LMS, cbrt(l), cbrt(mm), cbrt(s));
  return { L, a: A, b: B };
}

/**
 * OKLab back to encoded 0-255 channels. Out-of-gamut results are clipped per
 * channel, which is adequate here because it is only used for UI colours
 * derived from pixels that were in gamut to begin with.
 */
export function oklabToRgb(lab: Oklab, space: ColorSpace): [number, number, number] {
  const [l_, m_, s_] = apply(LMS_FROM_LAB, lab.L, lab.a, lab.b);
  const [lr, lg, lb] = apply(
    TRANSFORMS[space].linearFromLms,
    l_ * l_ * l_,
    m_ * m_ * m_,
    s_ * s_ * s_,
  );
  return [encodeChannel(lr), encodeChannel(lg), encodeChannel(lb)];
}

/** Linear RGB without clipping, so out-of-gamut colours stay recognisably out. */
export function oklabToLinearRgb(lab: Oklab, space: ColorSpace): [number, number, number] {
  const [l_, m_, s_] = apply(LMS_FROM_LAB, lab.L, lab.a, lab.b);
  return apply(TRANSFORMS[space].linearFromLms, l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
}

export function isInGamut(lab: Oklab, space: ColorSpace): boolean {
  const epsilon = 1e-4;
  return oklabToLinearRgb(lab, space).every((c) => c >= -epsilon && c <= 1 + epsilon);
}

/**
 * Pulls chroma down until the colour is displayable, keeping hue and lightness.
 *
 * Used when authoring palette colours from rules rather than by eye: a nominal
 * lightness and chroma will not be in gamut at every hue, and clipping the
 * channels instead would shift the hue, which is the one property a colour
 * family cannot afford to lose.
 */
export function reduceChromaToGamut(lch: Oklch, space: ColorSpace): Oklch {
  if (isInGamut(oklchToOklab(lch), space)) return lch;
  let low = 0;
  let high = lch.C;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (isInGamut(oklchToOklab({ ...lch, C: mid }), space)) low = mid;
    else high = mid;
  }
  return { ...lch, C: low };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

export function oklchToOklab(lch: Oklch): Oklab {
  const rad = (lch.h * Math.PI) / 180;
  return { L: lch.L, a: Math.cos(rad) * lch.C, b: Math.sin(rad) * lch.C };
}

export function chroma(lab: Oklab): number {
  return Math.hypot(lab.a, lab.b);
}

/** Straight-line distance in OKLab. Used to decide whether two colours differ. */
export function labDistance(x: Oklab, y: Oklab): number {
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

/**
 * Re-encodes a colour from one working space into another, via OKLab. Needed
 * because a colour input hands us sRGB while the pipeline may be working in
 * Display P3, and the same three numbers mean different colours in each.
 */
export function convertRgb(
  rgb: readonly [number, number, number],
  from: ColorSpace,
  to: ColorSpace,
): [number, number, number] {
  if (from === to) return [rgb[0], rgb[1], rgb[2]];
  return oklabToRgb(rgbToOklab(rgb[0], rgb[1], rgb[2], from), to);
}

/**
 * A near-black or near-white that reads against the given background. Decided
 * on OKLCH lightness rather than a luminance formula, because that is the axis
 * the rest of the pipeline already reasons about.
 */
export function contrastingText(
  background: readonly [number, number, number],
  space: ColorSpace,
): [number, number, number] {
  const { L } = rgbToOklab(background[0], background[1], background[2], space);
  return oklabToRgb({ L: L > 0.6 ? 0.2 : 0.96, a: 0, b: 0 }, space);
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a six-digit hex colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}
