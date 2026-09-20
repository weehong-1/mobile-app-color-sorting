import { describe, expect, it } from 'vitest';
import { contrastingText, rgbToOklab } from './color.ts';
import { drawLabel } from './compose.ts';
import { DEFAULT_LABEL_OPTIONS, extractLabel } from './label.ts';
import { DEFAULT_PIPELINE_OPTIONS, analyseScreenshot } from './pipeline.ts';
import { type Raster, type Rect, createRaster } from './raster.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import { filled } from '../test-support/synthetic.ts';

const ICON: Rect = { x: 100, y: 100, width: 200, height: 200 };

/** A blurred-looking wallpaper: a smooth gradient, like the real thing. */
function wallpaper(width: number, height: number): Raster {
  const raster = filled(width, height, [0, 0, 0]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raster.data[i] = 150 + 60 * Math.sin(x / 90);
      raster.data[i + 1] = 145 + 55 * Math.sin(y / 70);
      raster.data[i + 2] = 140 + 50 * Math.cos((x + y) / 110);
      raster.data[i + 3] = 255;
    }
  }
  return raster;
}

/** Crude white "text": a few bars where the strip will be. */
function paintText(raster: Raster, x0: number, y: number, bars: number): void {
  for (let bar = 0; bar < bars; bar++) {
    for (let dy = 0; dy < 16; dy++) {
      for (let dx = 0; dx < 8; dx++) {
        const px = x0 + bar * 14 + dx;
        const py = y + dy;
        const i = (py * raster.width + px) * 4;
        raster.data[i] = 255;
        raster.data[i + 1] = 255;
        raster.data[i + 2] = 255;
      }
    }
  }
}

const stripTop = Math.round(ICON.y + ICON.height + ICON.width * DEFAULT_LABEL_OPTIONS.gap);

describe('extractLabel', () => {
  it('recovers white text laid over a varying background', () => {
    const raster = wallpaper(500, 500);
    paintText(raster, 150, stripTop + 16, 6);
    const label = extractLabel(raster, ICON);
    expect(label).not.toBeNull();
    expect(label!.coverage).toBeGreaterThan(0.01);

    const at = (x: number, y: number) => label!.alpha[y * label!.bounds.width + x]!;
    // On a bar, and in the clear space above it.
    expect(at(150 + 4 - label!.bounds.x, stripTop + 16 + 8 - label!.bounds.y)).toBeGreaterThan(0.8);
    expect(at(150 + 4 - label!.bounds.x, 2)).toBeLessThan(0.05);
  });

  it('takes its strip from below the icon, offset by a fixed amount', () => {
    const raster = wallpaper(500, 500);
    paintText(raster, 150, stripTop + 16, 6);
    const label = extractLabel(raster, ICON)!;
    expect(label.bounds.y).toBe(stripTop);
    expect(label.bounds.y).toBeGreaterThan(ICON.y + ICON.height);
    expect(label.offsetY).toBe(label.bounds.y - ICON.y);
    expect(label.offsetX).toBe(label.bounds.x - ICON.x);
    // Wider than the icon, by the padding on each side.
    expect(label.bounds.width).toBeGreaterThan(ICON.width);
  });

  it('finds nothing under an icon with no label', () => {
    expect(extractLabel(wallpaper(500, 500), ICON)).toBeNull();
  });

  /**
   * The blue "new app" dot sits beside some labels and belongs to no icon.
   * Solving per channel and taking the minimum is what rejects it.
   */
  it('rejects a saturated coloured mark', () => {
    const raster = wallpaper(500, 500);
    for (let dy = 0; dy < 20; dy++) {
      for (let dx = 0; dx < 20; dx++) {
        const i = ((stripTop + 20 + dy) * raster.width + (150 + dx)) * 4;
        raster.data[i] = 20;
        raster.data[i + 1] = 110;
        raster.data[i + 2] = 255;
      }
    }
    expect(extractLabel(raster, ICON)).toBeNull();
  });

  it('rejects a shadow, which darkens rather than lightens', () => {
    const raster = wallpaper(500, 500);
    for (let dy = 0; dy < 30; dy++) {
      for (let dx = 0; dx < 80; dx++) {
        const i = ((stripTop + 20 + dy) * raster.width + (150 + dx)) * 4;
        for (let c = 0; c < 3; c++) raster.data[i + c] = raster.data[i + c]! * 0.6;
      }
    }
    expect(extractLabel(raster, ICON)).toBeNull();
  });

  it('returns nothing when the strip would fall off the bottom', () => {
    const raster = wallpaper(500, 340);
    expect(extractLabel(raster, ICON)).toBeNull();
  });
});

describe('drawLabel', () => {
  it('paints the recovered text in the colour given, blending by alpha', () => {
    const raster = wallpaper(500, 500);
    paintText(raster, 150, stripTop + 16, 6);
    const label = extractLabel(raster, ICON)!;
    const output = createRaster(500, 500, 'display-p3');
    for (let i = 0; i < 500 * 500; i++) {
      output.data[i * 4] = 10; output.data[i * 4 + 1] = 10; output.data[i * 4 + 2] = 12;
      output.data[i * 4 + 3] = 255;
    }
    drawLabel(output, { label, x: label.bounds.x, y: label.bounds.y, color: [250, 250, 250] });

    const onBar = ((stripTop + 16 + 8) * 500 + (150 + 4)) * 4;
    expect(output.data[onBar]).toBeGreaterThan(200);
    const offBar = ((stripTop + 2) * 500 + (150 + 4)) * 4;
    expect(output.data[offBar]).toBe(10);
  });
});

describe('contrastingText', () => {
  it('chooses dark text on a light background and light on a dark one', () => {
    const onLight = contrastingText([242, 242, 247], 'display-p3');
    const onDark = contrastingText([17, 17, 20], 'display-p3');
    expect(rgbToOklab(...onLight, 'display-p3').L).toBeLessThan(0.4);
    expect(rgbToOklab(...onDark, 'display-p3').L).toBeGreaterThan(0.8);
  });
});

describe('labels on the fixtures', () => {
  it.each([['dense', FIXTURES.dense, 16], ['sparse', FIXTURES.sparse, 8]] as const)(
    'recovers a label under every icon on the %s fixture',
    (_name, path, expected) => {
      const analysed = analyseScreenshot(readPng(path), DEFAULT_PIPELINE_OPTIONS);
      const labelled = analysed.icons.filter((icon) => icon.label);
      expect(labelled).toHaveLength(expected);
      for (const icon of labelled) {
        // Enough text to be a name, but nowhere near a filled rectangle.
        expect(icon.label!.coverage).toBeGreaterThan(0.02);
        expect(icon.label!.coverage).toBeLessThan(0.35);
      }
    },
  );
});
