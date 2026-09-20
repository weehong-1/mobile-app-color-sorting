import { describe, expect, it } from 'vitest';
import type { ColorClass, IconColor } from './analysis.ts';
import type { Grid, Slot } from './grid.ts';
import { type PlaceableIcon, arrange } from './layout.ts';
import type { AnalysedIcon, SortOptions } from './sort.ts';

const GRID: Grid = {
  left: 100, top: 200, size: 200,
  columnPitch: 300, rowPitch: 320,
  columns: 4, rows: 6,
};

const SORT: SortOptions = { mode: 'rainbow', whiteFirst: false };

function colour(colorClass: ColorClass, L: number, C: number, h: number): IconColor {
  return {
    dominant: { L, C, h },
    dominantShare: 0.7,
    accent: null,
    accentShare: 0,
    colorClass,
    sampleCount: 1000,
  };
}

/** Icons in reading order, as `analyseSlots` produces them. */
function icons(slots: readonly Slot[], colours: readonly IconColor[]): PlaceableIcon[] {
  return slots.map((slot, index) => ({
    slot,
    rect: {
      x: GRID.left + slot.column * GRID.columnPitch,
      y: GRID.top + slot.row * GRID.rowPitch,
      width: GRID.size,
      height: GRID.size,
    },
    color: colours[index]!,
  }));
}

const plain = (n: number) => Array.from({ length: n }, () => colour('chromatic', 0.6, 0.2, 30));

/** A trivial "sort" that reverses, so the arrangement is visibly not the input. */
const reversed = (count: number): AnalysedIcon[] =>
  Array.from({ length: count }, (_, i) => ({ index: count - 1 - i, color: plain(count)[i]! }));

const at = (column: number, row: number) => ({
  x: GRID.left + column * GRID.columnPitch,
  y: GRID.top + row * GRID.rowPitch,
  width: GRID.size,
  height: GRID.size,
});

describe('arrange, original positions', () => {
  it('gives the nth icon of the sort the nth slot that was occupied', () => {
    const slots: Slot[] = [{ column: 0, row: 0 }, { column: 2, row: 0 }, { column: 1, row: 3 }];
    const result = arrange(GRID, icons(slots, plain(3)), reversed(3), 'original', SORT);
    expect(result.map((r) => r.index)).toEqual([2, 1, 0]);
    expect(result.map((r) => r.rect)).toEqual([at(0, 0), at(2, 0), at(1, 3)]);
  });

  it('leaves the gaps exactly where they were', () => {
    const slots: Slot[] = [{ column: 0, row: 0 }, { column: 3, row: 5 }];
    const result = arrange(GRID, icons(slots, plain(2)), reversed(2), 'original', SORT);
    expect(result.map((r) => r.rect)).toEqual([at(0, 0), at(3, 5)]);
  });
});

describe('arrange, packed', () => {
  it('fills from the top-left with no gaps, in sorted order', () => {
    const slots: Slot[] = [
      { column: 0, row: 0 }, { column: 1, row: 0 },
      { column: 0, row: 2 }, { column: 1, row: 2 }, { column: 2, row: 2 }, { column: 3, row: 2 },
    ];
    const result = arrange(GRID, icons(slots, plain(6)), reversed(6), 'packed', SORT);
    expect(result.map((r) => r.index)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(result.map((r) => r.rect)).toEqual([
      at(0, 0), at(1, 0), at(2, 0), at(3, 0),
      at(0, 1), at(1, 1),
    ]);
  });

  it('starts where the detected grid starts', () => {
    const slots: Slot[] = [{ column: 2, row: 4 }];
    const result = arrange(GRID, icons(slots, plain(1)), reversed(1), 'packed', SORT);
    expect(result[0]!.rect).toEqual(at(0, 0));
  });

  it('left-aligns a short last row', () => {
    const slots: Slot[] = Array.from({ length: 7 }, (_, i) => ({ column: i % 4, row: Math.floor(i / 4) }));
    const result = arrange(GRID, icons(slots, plain(7)), reversed(7), 'packed', SORT);
    const lastRow = result.slice(4).map((r) => r.rect);
    expect(lastRow).toEqual([at(0, 1), at(1, 1), at(2, 1)]);
  });

  it('handles an empty page', () => {
    expect(arrange(GRID, [], [], 'packed', SORT)).toEqual([]);
  });
});

describe('arrange, within rows', () => {
  /** Nothing moves between rows, and each row is ordered against itself. */
  it('sorts each row independently', () => {
    const slots: Slot[] = [
      { column: 0, row: 0 }, { column: 1, row: 0 },
      { column: 0, row: 1 }, { column: 1, row: 1 },
    ];
    // Row 0: blue then red. Row 1: green then pink.
    const colours = [
      colour('chromatic', 0.6, 0.2, 260),
      colour('chromatic', 0.6, 0.2, 25),
      colour('chromatic', 0.6, 0.2, 145),
      colour('chromatic', 0.6, 0.2, 350),
    ];
    const result = arrange(GRID, icons(slots, colours), [], 'within-rows', SORT);
    // Each row reorders to put the earlier hue first; neither row's icons move out of it.
    expect(result.map((r) => r.index)).toEqual([1, 0, 3, 2]);
    expect(result.map((r) => r.rect)).toEqual([at(0, 0), at(1, 0), at(0, 1), at(1, 1)]);
  });

  it('keeps a gap inside a row rather than closing it', () => {
    const slots: Slot[] = [
      { column: 0, row: 0 }, { column: 2, row: 0 }, { column: 3, row: 0 },
    ];
    const colours = [
      colour('chromatic', 0.6, 0.2, 260),
      colour('chromatic', 0.6, 0.2, 145),
      colour('chromatic', 0.6, 0.2, 25),
    ];
    const result = arrange(GRID, icons(slots, colours), [], 'within-rows', SORT);
    // Columns 0, 2 and 3 are used exactly as before; column 1 stays empty.
    expect(result.map((r) => r.rect)).toEqual([at(0, 0), at(2, 0), at(3, 0)]);
    expect(result.map((r) => r.index)).toEqual([2, 1, 0]);
  });

  it('ignores the whole-page sort it is handed', () => {
    const slots: Slot[] = [{ column: 0, row: 0 }, { column: 1, row: 0 }];
    const colours = [colour('chromatic', 0.6, 0.2, 25), colour('chromatic', 0.6, 0.2, 260)];
    const misleading: AnalysedIcon[] = [
      { index: 1, color: colours[1]! },
      { index: 0, color: colours[0]! },
    ];
    const result = arrange(GRID, icons(slots, colours), misleading, 'within-rows', SORT);
    expect(result.map((r) => r.index)).toEqual([0, 1]);
  });

  it('breaks ties on the row\'s own reading order, not the page\'s', () => {
    const slots: Slot[] = [
      { column: 0, row: 0 }, { column: 1, row: 0 },
      { column: 0, row: 1 }, { column: 1, row: 1 },
    ];
    const result = arrange(GRID, icons(slots, plain(4)), [], 'within-rows', SORT);
    expect(result.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it('leaves a single-icon row alone', () => {
    const slots: Slot[] = [{ column: 2, row: 3 }];
    const result = arrange(GRID, icons(slots, plain(1)), [], 'within-rows', SORT);
    expect(result).toEqual([{ index: 0, rect: at(2, 3) }]);
  });
});
