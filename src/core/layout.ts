/**
 * Deciding which slot each sorted icon gets.
 *
 * Sorting produces an order; this turns that order into positions. The three
 * modes differ in how far the sort reaches as much as in where icons land, so
 * the choice is made here rather than being a property of the sort.
 */
import type { IconColor } from './analysis.ts';
import { type Grid, type Slot, slotRect } from './grid.ts';
import type { Rect } from './raster.ts';
import { type AnalysedIcon, type SortOptions, sortIcons } from './sort.ts';

/** The list is the source of truth; see the note on SORT_MODES. */
export const LAYOUT_MODES = ['packed', 'original', 'within-rows'] as const;

export type LayoutMode = (typeof LAYOUT_MODES)[number];

export const DEFAULT_LAYOUT: LayoutMode = 'packed';

/** The minimum an icon needs to be placed. */
export interface PlaceableIcon {
  readonly slot: Slot;
  /** The slot square it came from, in screenshot coordinates. */
  readonly rect: Rect;
  readonly color: IconColor;
}

export interface Arranged {
  /** Index into the icons array. */
  readonly index: number;
  /** The slot square this icon is drawn into. */
  readonly rect: Rect;
}

function rectAt(grid: Grid, column: number, row: number): Rect {
  const band = slotRect(grid, { column, row });
  return { x: band.start, y: band.top, width: grid.size, height: grid.size };
}

/**
 * `icons` must be in reading order, which is what `analyseSlots` produces, and
 * `order` is the whole-page sort. `order` is ignored for 'within-rows', which
 * sorts each row against itself instead.
 */
export function arrange(
  grid: Grid,
  icons: readonly PlaceableIcon[],
  order: readonly AnalysedIcon[],
  mode: LayoutMode,
  sortOptions: SortOptions,
): Arranged[] {
  switch (mode) {
    case 'original':
      // The nth icon of the sort takes the nth slot that was occupied.
      return order.map((entry, position) => ({
        index: entry.index,
        rect: icons[position]!.rect,
      }));

    case 'packed':
      // Fill from the top-left, left to right, until the icons run out. The
      // block starts where the detected grid starts, so the first icon lands
      // where the first icon was.
      return order.map((entry, position) => ({
        index: entry.index,
        rect: rectAt(grid, position % grid.columns, Math.floor(position / grid.columns)),
      }));

    case 'within-rows': {
      // Each row is sorted against itself and keeps the columns it was using,
      // so nothing moves between rows and no gap inside a row is closed.
      const rows = new Map<number, number[]>();
      icons.forEach((icon, index) => {
        const row = rows.get(icon.slot.row);
        if (row) row.push(index);
        else rows.set(icon.slot.row, [index]);
      });

      const arranged: Arranged[] = [];
      for (const row of [...rows.keys()].sort((a, b) => a - b)) {
        const members = rows.get(row)!;
        const destinations = members.map((index) => icons[index]!.rect);
        // Sorting by position within the row keeps ties in the row's own
        // reading order rather than the whole page's.
        const sorted = sortIcons(
          members.map((index, position) => ({ index: position, color: icons[index]!.color })),
          sortOptions,
        );
        sorted.forEach((entry, position) => {
          arranged.push({ index: members[entry.index]!, rect: destinations[position]! });
        });
      }
      return arranged;
    }
  }
}
