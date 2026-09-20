/**
 * Background presets: four neutrals, plus two taken from the screenshot's own
 * wallpaper so the result can be made to feel like it belongs to the original.
 */
import {
  type ColorSpace,
  convertRgb,
  oklabToRgb,
  oklabToOklch,
  oklchToOklab,
  rgbToOklab,
  rgbToHex,
} from '../core/color.ts';
import type { Raster } from '../core/raster.ts';

export interface Preset {
  readonly label: string;
  readonly hex: string;
}

export const NEUTRAL_PRESETS: readonly Preset[] = [
  { label: 'Off white', hex: '#f2f2f7' },
  { label: 'Light grey', hex: '#d3d3da' },
  { label: 'Dark grey', hex: '#3a3a42' },
  { label: 'Near black', hex: '#111114' },
];

/**
 * Samples the wallpaper and returns a muted version of it plus a deliberately
 * deep one.
 *
 * The hex comes back in sRGB even when the screenshot is Display P3, because
 * everything above the compositor -- the colour input, the stored preference,
 * the CSS swatch -- speaks sRGB. Converting once, at compose time, keeps a
 * single conversion in one place rather than a colour that is already in the
 * working space being converted into it a second time.
 */
export function wallpaperPresets(raster: Raster, space: ColorSpace): Preset[] {
  const step = Math.max(1, Math.round(raster.width / 160));
  let L = 0, a = 0, b = 0, n = 0;
  const top = Math.round(raster.height * 0.1);
  const bottom = Math.round(raster.height * 0.75);
  for (let y = top; y < bottom; y += step) {
    for (let x = 0; x < raster.width; x += step) {
      const i = (y * raster.width + x) * 4;
      const lab = rgbToOklab(raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!, space);
      L += lab.L; a += lab.a; b += lab.b; n++;
    }
  }
  if (n === 0) return [];

  const average = { L: L / n, a: a / n, b: b / n };
  const lch = oklabToOklch(average);
  const muted = oklchToOklab({ L: lch.L, C: Math.min(lch.C, 0.04), h: lch.h });
  const deep = oklchToOklab({ L: 0.18, C: Math.min(lch.C, 0.05), h: lch.h });
  const toSrgbHex = (rgb: [number, number, number]) => rgbToHex(...convertRgb(rgb, space, 'srgb'));
  return [
    { label: 'From the wallpaper', hex: toSrgbHex(oklabToRgb(muted, space)) },
    { label: 'Deep wallpaper tone', hex: toSrgbHex(oklabToRgb(deep, space)) },
  ];
}
