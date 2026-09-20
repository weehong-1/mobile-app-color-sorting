/**
 * Runs the pipeline over the fixtures and writes debug images and score tables
 * to debug/ (gitignored).
 *
 * Run with: npm run debug
 */
import { mkdirSync } from 'node:fs';
import { gradientField } from '../src/core/gradient.ts';
import { DEFAULT_DETECT_OPTIONS, detectGrid, slotRect } from '../src/core/grid.ts';
import { clone, drawCross, drawRect, fillRect } from '../src/test-support/draw.ts';
import { DEFAULT_SPRITE_OPTIONS, extractSprite } from '../src/core/sprite.ts';
import { createRaster } from '../src/core/raster.ts';
import { DEFAULT_ANALYSIS_OPTIONS, analyseSprite } from '../src/core/analysis.ts';
import { DEFAULT_SORT_OPTIONS, rotateHue, sortIcons } from '../src/core/sort.ts';
import { builtinPalette, familyIndexFor, nearestSwatch } from '../src/core/palette.ts';
import { DEFAULT_PIPELINE_OPTIONS, analyseScreenshot, composeSorted } from '../src/core/pipeline.ts';
import { contrastingText, convertRgb, hexToRgb } from '../src/core/color.ts';
import { FIXTURES, readPng } from '../src/test-support/png.ts';
import { writePng } from '../src/test-support/png-write.ts';
import truthDense from '../fixtures/IMG_0571.truth.json' with { type: 'json' };
import truthSparse from '../fixtures/IMG_0572.truth.json' with { type: 'json' };

const TRUTH = { dense: truthDense, sparse: truthSparse };
const DETECTED: readonly [number, number, number] = [255, 64, 0];
const TRUTH_COLOR: readonly [number, number, number] = [0, 224, 255];
const EMPTY: readonly [number, number, number] = [120, 120, 120];

mkdirSync('debug', { recursive: true });

for (const [name, path] of Object.entries(FIXTURES)) {
  const raster = readPng(path);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);
  const overlay = clone(raster);

  for (let row = 0; row < detection.grid.rows; row++) {
    for (let column = 0; column < detection.grid.columns; column++) {
      const rect = slotRect(detection.grid, { column, row });
      const occupied = detection.occupied.some((s) => s.column === column && s.row === row);
      drawRect(overlay, rect.start, rect.top, detection.grid.size, detection.grid.size,
        occupied ? DETECTED : EMPTY, occupied ? 3 : 1);
    }
  }
  for (const icon of TRUTH[name as keyof typeof TRUTH].icons) {
    drawRect(overlay, icon.left, icon.top, icon.width, icon.height, TRUTH_COLOR, 1);
    drawCross(overlay, icon.left, icon.top, TRUTH_COLOR, 16);
  }

  await writePng(overlay, `debug/grid-${name}.png`);
  await writePng(overlay, `debug/grid-${name}-small.png`, 0.42);

  // Sprite sheet: every sprite drawn through its mask onto a checkerboard, so
  // corner rounding, the badge pill and any wallpaper leak are all visible.
  const sprites = detection.occupied.map((slot) => {
    const rect = slotRect(detection.grid, slot);
    return extractSprite(
      raster,
      { x: rect.start, y: rect.top, width: detection.grid.size, height: detection.grid.size },
      DEFAULT_SPRITE_OPTIONS,
    );
  });
  const cell = Math.max(...sprites.map((s) => Math.max(s.bounds.width, s.bounds.height))) + 16;
  const perRow = 4;
  const sheet = createRaster(cell * perRow, cell * Math.ceil(sprites.length / perRow), raster.space);
  for (let y = 0; y < sheet.height; y++) {
    for (let x = 0; x < sheet.width; x++) {
      const dark = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
      fillRect(sheet, x, y, 1, 1, dark ? [64, 64, 72] : [96, 96, 104]);
    }
  }
  sprites.forEach((sprite, index) => {
    const ox = (index % perRow) * cell + 8;
    const oy = Math.floor(index / perRow) * cell + 8;
    for (let y = 0; y < sprite.bounds.height; y++) {
      for (let x = 0; x < sprite.bounds.width; x++) {
        const alpha = sprite.mask[y * sprite.bounds.width + x]!;
        if (alpha <= 0) continue;
        const from = (y * sprite.bounds.width + x) * 4;
        fillRect(sheet, ox + x, oy + y, 1, 1,
          [sprite.pixels[from]!, sprite.pixels[from + 1]!, sprite.pixels[from + 2]!], alpha);
      }
    }
  });
  await writePng(sheet, `debug/sprites-${name}.png`);
  await writePng(sheet, `debug/sprites-${name}-small.png`, 0.5);

  const names = TRUTH[name as keyof typeof TRUTH].icons.map((icon) => icon.name);
  const badged = sprites.filter((s) => s.badge).length;
  console.log(`\n=== ${name}: ${detection.occupied.length} icons, ${badged} badged ===`);

  console.log('\noccupancy scores (threshold ' + detection.threshold.toFixed(2) + '):');
  for (const [r, row] of detection.scores.entries()) {
    console.log('  row ' + r + ': ' +
      row.map((score) => `${score.toFixed(2).padStart(6)}${score >= detection.threshold ? '*' : ' '}`).join(' '));
  }

  const colors = sprites.map((sprite) => analyseSprite(sprite, DEFAULT_ANALYSIS_OPTIONS));
  console.log('\nper icon colour:');
  console.log('  name           class      L     C      h   share   accent L,C,h      share');
  colors.forEach((color, index) => {
    const accent = color.accent
      ? `${color.accent.L.toFixed(2)},${color.accent.C.toFixed(2)},${String(Math.round(color.accent.h)).padStart(3)}`
      : '      -      ';
    console.log(
      `  ${(names[index] ?? '?').padEnd(14)} ${color.colorClass.padEnd(10)} ` +
        `${color.dominant.L.toFixed(3)} ${color.dominant.C.toFixed(3)} ${String(Math.round(color.dominant.h)).padStart(4)} ` +
        `${(color.dominantShare * 100).toFixed(0).padStart(4)}%   ${accent} ${(color.accentShare * 100).toFixed(1).padStart(5)}%`,
    );
  });

  const palette = builtinPalette();
  const sorted = sortIcons(colors.map((color, index) => ({ index, color })), DEFAULT_SORT_OPTIONS);
  console.log('\nrainbow order:');
  sorted.forEach((icon, position) => {
    const { color } = icon;
    const neutral = color.dominant.C < DEFAULT_ANALYSIS_OPTIONS.neutralMaxChroma;
    const key =
      color.colorClass === 'white'
        ? color.accent ? `accent rot ${rotateHue(color.accent.h).toFixed(0)}` : 'no accent'
        : color.colorClass === 'gray'
          ? `L ${color.dominant.L.toFixed(2)}`
          : color.colorClass === 'dark' && neutral
            ? `no hue, L ${color.dominant.L.toFixed(3)}`
            : `rot ${rotateHue(color.dominant.h).toFixed(0)}`;
    console.log(`  ${String(position + 1).padStart(3)}. ${(names[icon.index] ?? '?').padEnd(14)} ${color.colorClass.padEnd(10)} ${key}`);
  });
  const byFamily = sortIcons(
    colors.map((color, index) => ({ index, color })),
    { mode: 'families', whiteFirst: false, palette },
  );
  console.log('\ncolour families order:');
  byFamily.forEach((icon, position) => {
    const { color } = icon;
    const note =
      color.colorClass === 'chromatic'
        ? `${palette.families[familyIndexFor(color.dominant.h, palette)]!.name} family, ` +
          `L ${color.dominant.L.toFixed(2)}, nearest ${nearestSwatch(color.dominant, palette)!.name}`
        : color.colorClass;
    console.log(`  ${String(position + 1).padStart(3)}. ${(names[icon.index] ?? '?').padEnd(14)} ${note}`);
  });

  // Sorted output, on a few backgrounds.
  const analysed = analyseScreenshot(raster, DEFAULT_PIPELINE_OPTIONS);
  for (const [label, hex] of [['light', '#f2f2f7'], ['dark', '#111114']] as const) {
    const background = convertRgb(hexToRgb(hex), 'srgb', raster.space);
    const result = composeSorted(raster, analysed, { background });
    await writePng(result, `debug/sorted-${name}-${label}.png`);
    await writePng(result, `debug/sorted-${name}-${label}-small.png`, 0.42);

    const labelled = composeSorted(raster, analysed, {
      background,
      labelColor: contrastingText(background, raster.space),
    });
    await writePng(labelled, `debug/labelled-${name}-${label}.png`);
    await writePng(labelled, `debug/labelled-${name}-${label}-small.png`, 0.42);
  }
  const withLabels = analysed.icons.filter((icon) => icon.label).length;
  console.log(`\nlabels recovered: ${withLabels} of ${analysed.icons.length}` +
    ` (coverage ${analysed.icons.map((i) => i.label ? (i.label.coverage * 100).toFixed(1) : '-').join(', ')})`);
  console.log(`\nwrote debug/grid-${name}.png, sprites-${name}.png, sorted-${name}-{light,dark}.png`);
}
