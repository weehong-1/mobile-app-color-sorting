import { describe, expect, it } from 'vitest';
import { gradientField } from './gradient.ts';
import {
  DEFAULT_DETECT_OPTIONS,
  DEFAULT_OCCUPANCY_OPTIONS,
  type RowBand,
  detectGrid,
  fitRowLattice,
  occupancyThreshold,
  scoreOccupancy,
  slotRect,
} from './grid.ts';
import { filled, paintRoundedRect } from '../test-support/synthetic.ts';
import { FIXTURES, readPng } from '../test-support/png.ts';
import truthDense from '../../fixtures/IMG_0571.truth.json' with { type: 'json' };
import truthSparse from '../../fixtures/IMG_0572.truth.json' with { type: 'json' };
import truthFlat from '../../fixtures/IMG_0910.truth.json' with { type: 'json' };

/** Criterion 1's tolerance, against the hand-measured truth files. */
const TOLERANCE = 3;

const bands = (...tops: ReadonlyArray<[number, number]>): RowBand[] =>
  tops.map(([top, strength]) => ({ top, strength }));

describe('fitRowLattice', () => {
  const options = { ...DEFAULT_DETECT_OPTIONS };

  it('fits a fully occupied run of rows', () => {
    const lattice = fitRowLattice(
      bands([216, 100], [535, 100], [854, 100], [1173, 100], [1492, 100], [1811, 100]),
      203,
      options,
    );
    expect(lattice).not.toBeNull();
    expect(lattice!.top).toBeCloseTo(216, 0);
    expect(lattice!.pitch).toBeCloseTo(319, 0);
    expect(lattice!.rows).toBe(6);
  });

  /** The IMG_0572 case that ADR-0005 exists for. */
  it('spans empty rows in the middle', () => {
    const lattice = fitRowLattice(bands([216, 120], [535, 110], [1811, 80]), 203, options);
    expect(lattice!.top).toBeCloseTo(216, 0);
    expect(lattice!.pitch).toBeCloseTo(319, 0);
    expect(lattice!.rows).toBe(6);
  });

  /**
   * The dock's icons form a real band. A slightly wider pitch reaches it while
   * skipping the true bottom row, explaining just as many bands -- so the
   * tiebreak has to reject it for needing more rows to do so.
   */
  it('prefers the true pitch over one that reaches the dock', () => {
    const lattice = fitRowLattice(
      bands([215, 122], [535, 108], [1810, 77], [2477, 102]),
      204,
      options,
    );
    expect(lattice!.pitch).toBeCloseTo(319, 0);
    expect(lattice!.rows).toBe(6);
    // The dock sits off the lattice, so it is never a row.
    expect(lattice!.top + (lattice!.rows - 1) * lattice!.pitch).toBeLessThan(2000);
  });

  it('ignores a pitch outside the allowed ratio range', () => {
    // Bands 80px apart cannot be rows of a 203px icon.
    expect(fitRowLattice(bands([216, 100], [296, 100]), 203, options)).toBeNull();
  });

  it('returns null when there is nothing to fit', () => {
    expect(fitRowLattice([], 203, options)).toBeNull();
  });

  it('falls back to a single row when only one band is found', () => {
    const lattice = fitRowLattice(bands([216, 100]), 203, options);
    expect(lattice).toEqual({ top: 216, pitch: 203 * options.minPitchRatio, rows: 1 });
  });
});

describe('occupancyThreshold', () => {
  it('splits at the gap between occupied and empty slots', () => {
    const threshold = occupancyThreshold([[13.5, 6.5, 0, 0], [3.1, 17.6, 0, 0]], DEFAULT_OCCUPANCY_OPTIONS);
    expect(threshold).toBeLessThan(3.1);
    expect(threshold).toBeGreaterThanOrEqual(DEFAULT_OCCUPANCY_OPTIONS.floor);
  });

  /** A full page has no gap, so every slot above the floor must stay occupied. */
  it('keeps every slot when the scores do not separate', () => {
    const scores = [[13.5, 12.1, 11.4, 10.8], [9.9, 9.2, 8.6, 8.1]];
    const threshold = occupancyThreshold(scores, DEFAULT_OCCUPANCY_OPTIONS);
    expect(threshold).toBe(DEFAULT_OCCUPANCY_OPTIONS.floor);
    expect(scores.flat().every((s) => s >= threshold)).toBe(true);
  });

  it('never drops below the floor, so an empty page finds nothing', () => {
    expect(occupancyThreshold([[0, 0], [0, 0]], DEFAULT_OCCUPANCY_OPTIONS))
      .toBe(DEFAULT_OCCUPANCY_OPTIONS.floor);
  });
});

describe('scoreOccupancy', () => {
  /**
   * The IMG_0910 case that ADR-0008 exists for, in miniature: a flat icon with
   * no interior detail at all, which only its own outline gives away.
   */
  it('scores a flat icon far above the empty slot beside it', () => {
    const grid = {
      left: 20, top: 20, size: 100, columnPitch: 140, rowPitch: 140, columns: 2, rows: 1,
    };
    const raster = filled(320, 160, [120, 180, 230]);
    paintRoundedRect(raster, { x: 20, y: 20, width: 100, height: 100, radius: 22 }, [200, 40, 40]);

    const scores = scoreOccupancy(gradientField(raster), grid, DEFAULT_OCCUPANCY_OPTIONS);
    expect(scores[0]![1]!).toBe(0);
    expect(scores[0]![0]!).toBeGreaterThan(DEFAULT_OCCUPANCY_OPTIONS.floor);
  });
});

describe.each([
  ['dense', FIXTURES.dense, truthDense, 16, 6],
  ['sparse', FIXTURES.sparse, truthSparse, 8, 6],
  ['flat', FIXTURES.flat, truthFlat, 21, 6],
] as const)('detectGrid on the %s fixture', (_name, path, truth, expectedIcons, expectedRows) => {
  const raster = readPng(path);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);

  it('reads the screenshot as Display P3', () => {
    expect(raster.space).toBe('display-p3');
    expect(raster.width).toBe(truth.width);
    expect(raster.height).toBe(truth.height);
  });

  it(`finds exactly ${expectedIcons} icons`, () => {
    expect(detection.occupied).toHaveLength(expectedIcons);
  });

  it('finds them in the slots the truth file records', () => {
    const found = detection.occupied.map((s) => `${s.column},${s.row}`).sort();
    const expected = truth.icons.map((i) => `${i.column},${i.row}`).sort();
    expect(found).toEqual(expected);
  });

  it(`finds ${expectedRows} rows and leaves the dock out of the grid`, () => {
    expect(detection.grid.rows).toBe(expectedRows);
    const lastBottom = detection.grid.top + (expectedRows - 1) * detection.grid.rowPitch + detection.grid.size;
    expect(lastBottom).toBeLessThan(raster.height * 0.78);
  });

  it(`places every icon within ${TOLERANCE}px of the truth`, () => {
    const errors = truth.icons.map((icon) => {
      const rect = slotRect(detection.grid, { column: icon.column, row: icon.row });
      return {
        name: icon.name,
        left: Math.abs(rect.start - icon.left),
        top: Math.abs(rect.top - icon.top),
        right: Math.abs(rect.end - icon.right),
        bottom: Math.abs(rect.bottom - icon.bottom),
      };
    });
    const worst = Math.max(...errors.flatMap((e) => [e.left, e.top, e.right, e.bottom]));
    expect(worst, `worst edge error was ${worst.toFixed(2)}px`).toBeLessThanOrEqual(TOLERANCE);
  });

  it('recovers an icon size close to the measured one', () => {
    const measured = truth.icons.map((i) => i.width).sort((a, b) => a - b);
    const median = measured[measured.length >> 1]!;
    expect(Math.abs(detection.grid.size - median)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('separates occupied from empty scores by a clear margin', () => {
    const occupied = new Set(detection.occupied.map((s) => `${s.column},${s.row}`));
    const lowestOccupied = Math.min(
      ...detection.scores.flatMap((row, r) =>
        row.map((score, c) => (occupied.has(`${c},${r}`) ? score : Infinity)),
      ),
    );
    const highestEmpty = Math.max(
      ...detection.scores.flatMap((row, r) =>
        row.map((score, c) => (occupied.has(`${c},${r}`) ? -Infinity : score)),
      ),
    );
    expect(lowestOccupied).toBeGreaterThan(highestEmpty * 2);
  });
});
