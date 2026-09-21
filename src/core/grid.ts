/**
 * Finding the icon grid in a screenshot.
 *
 * Columns are found by brute-force search over left edge, icon size and pitch,
 * scored against the vertical-edge projection. Rows are not (ADR-0005): a page
 * can have empty rows in the middle, and any scoring that averages over edges
 * rewards a pitch that skips them. Instead we detect row bands and fit the
 * largest lattice that explains the most of them.
 *
 * All coordinates here are in the space of the raster passed in, which for the
 * app is the downscaled working copy (ADR-0001).
 */
import {
  type Band,
  type GradientField,
  columnProjection,
  meanMagnitude,
  outlineMagnitude,
  rowProjection,
} from './gradient.ts';

export interface Grid {
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly columnPitch: number;
  readonly rowPitch: number;
  readonly columns: number;
  readonly rows: number;
}

export interface Slot {
  readonly column: number;
  readonly row: number;
}

export interface GridDetection {
  readonly grid: Grid;
  readonly occupied: readonly Slot[];
  /** Occupancy score for every slot, indexed [row][column]. */
  readonly scores: readonly (readonly number[])[];
  readonly threshold: number;
}

export interface DetectOptions {
  readonly columns: number;
  readonly minSizeFraction: number;
  readonly maxSizeFraction: number;
  readonly minPitchRatio: number;
  readonly maxPitchRatio: number;
  /** Maximum rows to consider when fitting the lattice. */
  readonly maxRows: number;
  /** How far a band may sit from a lattice point and still count, in pixels. */
  readonly latticeTolerance: number;
  readonly occupancy: OccupancyOptions;
}

export interface OccupancyOptions {
  /** Fraction of the icon square trimmed away before scoring its interior. */
  readonly inset: number;
  /**
   * How far either side of the icon square's edge the outline band reaches, as
   * a fraction of the icon size.
   */
  readonly outline: number;
  /** Absolute floor, so a page with no icons cannot invent them. */
  readonly floor: number;
  /**
   * How much bigger the occupied scores must be than the empty ones before we
   * believe there is a split at all. Below this we assume every slot above the
   * floor is occupied, which is what a completely full page looks like.
   */
  readonly minGapRatio: number;
}

export const DEFAULT_OCCUPANCY_OPTIONS: OccupancyOptions = {
  inset: 0.1,
  outline: 0.06,
  floor: 1.2,
  minGapRatio: 2.5,
};

export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  columns: 4,
  minSizeFraction: 0.09,
  maxSizeFraction: 0.23,
  minPitchRatio: 1.05,
  maxPitchRatio: 2.0,
  maxRows: 10,
  latticeTolerance: 4,
  occupancy: DEFAULT_OCCUPANCY_OPTIONS,
};

export class GridNotFoundError extends Error {
  readonly reason: 'columns' | 'rows';

  constructor(reason: 'columns' | 'rows') {
    super(
      reason === 'columns'
        ? 'Could not find a column grid. Adjust the sliders or pick a different column count.'
        : 'Could not find a row grid. Adjust the sliders or pick a different column count.',
    );
    this.name = 'GridNotFoundError';
    this.reason = reason;
  }
}

/** Highest projection value within `radius` of `at`, or -1 if out of bounds. */
function sampleAround(projection: Float64Array, at: number, radius: number): number {
  const k = Math.round(at);
  if (k < 0 || k >= projection.length) return -1;
  let best = projection[k]!;
  for (let d = 1; d <= radius; d++) {
    if (k - d >= 0) best = Math.max(best, projection[k - d]!);
    if (k + d < projection.length) best = Math.max(best, projection[k + d]!);
  }
  return best;
}

interface ColumnFit {
  readonly left: number;
  readonly size: number;
  readonly pitch: number;
  readonly score: number;
}

function scoreColumns(
  projection: Float64Array,
  left: number,
  size: number,
  pitch: number,
  columns: number,
  radius: number,
): number {
  let total = 0;
  for (let i = 0; i < columns; i++) {
    const start = left + i * pitch;
    const leftEdge = sampleAround(projection, start, radius);
    const rightEdge = sampleAround(projection, start + size, radius);
    if (leftEdge < 0 || rightEdge < 0) return -1;
    total += leftEdge + rightEdge;
  }
  return total;
}

function searchColumns(
  projection: Float64Array,
  width: number,
  options: DetectOptions,
): ColumnFit | null {
  const minSize = Math.round(width * options.minSizeFraction);
  const maxSize = Math.round(width * options.maxSizeFraction);
  let best: ColumnFit | null = null;

  const sweep = (
    sizes: readonly number[],
    pitchStep: number,
    leftStep: number,
    radius: number,
    pitchRange: (size: number) => [number, number],
    leftRange: (size: number, pitch: number) => [number, number],
  ) => {
    for (const size of sizes) {
      const [minPitch, maxPitch] = pitchRange(size);
      for (let pitch = minPitch; pitch <= maxPitch; pitch += pitchStep) {
        const span = (options.columns - 1) * pitch + size;
        if (span > width) break;
        const [fromLeft, toLeft] = leftRange(size, pitch);
        for (let left = Math.max(0, fromLeft); left <= Math.min(width - span, toLeft); left += leftStep) {
          const score = scoreColumns(projection, left, size, pitch, options.columns, radius);
          if (score > (best?.score ?? -1)) best = { left, size, pitch, score };
        }
      }
    }
  };

  const coarseSizes: number[] = [];
  for (let s = minSize; s <= maxSize; s += 2) coarseSizes.push(s);
  sweep(
    coarseSizes,
    2,
    2,
    2,
    (size) => [size * options.minPitchRatio, size * options.maxPitchRatio],
    () => [0, width],
  );
  if (!best) return null;

  const coarse: ColumnFit = best;
  const fineSizes: number[] = [];
  for (let s = coarse.size - 3; s <= coarse.size + 3; s++) if (s >= minSize && s <= maxSize) fineSizes.push(s);
  sweep(
    fineSizes,
    0.25,
    1,
    0,
    () => [coarse.pitch - 3, coarse.pitch + 3],
    () => [coarse.left - 4, coarse.left + 4],
  );

  return best;
}

/**
 * Snap a column fit onto the projection's actual peaks and refit by least
 * squares. The brute-force search gets within a pixel or two; this is what
 * takes it to the sub-pixel truth, which matters because the pitch is
 * fractional and errors compound across the row.
 */
function snapColumns(projection: Float64Array, fit: ColumnFit, columns: number): ColumnFit {
  const peakNear = (at: number, radius: number): number | null => {
    const from = Math.max(0, Math.round(at) - radius);
    const to = Math.min(projection.length - 1, Math.round(at) + radius);
    let bestAt = -1;
    let bestValue = 0;
    for (let k = from; k <= to; k++) {
      if (projection[k]! > bestValue) { bestValue = projection[k]!; bestAt = k; }
    }
    return bestAt < 0 ? null : bestAt;
  };

  const lefts: Array<[number, number]> = [];
  const sizes: number[] = [];
  for (let i = 0; i < columns; i++) {
    const l = peakNear(fit.left + i * fit.pitch, 3);
    const r = peakNear(fit.left + i * fit.pitch + fit.size, 3);
    if (l === null || r === null) continue;
    lefts.push([i, l]);
    sizes.push(r - l);
  }
  if (lefts.length < 2) return fit;

  // Least squares over (index, left edge).
  const n = lefts.length;
  const meanI = lefts.reduce((a, [i]) => a + i, 0) / n;
  const meanL = lefts.reduce((a, [, l]) => a + l, 0) / n;
  let num = 0;
  let den = 0;
  for (const [i, l] of lefts) {
    num += (i - meanI) * (l - meanL);
    den += (i - meanI) ** 2;
  }
  const pitch = den === 0 ? fit.pitch : num / den;
  const left = meanL - pitch * meanI;

  const sorted = [...sizes].sort((a, b) => a - b);
  const size = sorted[Math.floor(sorted.length / 2)] ?? fit.size;
  return { left, size, pitch, score: fit.score };
}

export interface RowBand {
  readonly top: number;
  readonly strength: number;
}

/**
 * Candidate row tops. A band is a top edge with a matching bottom edge one icon
 * size below it, which is also what keeps the dock's container out: it is 313px
 * tall, not 203, so its edges never pair.
 */
export function detectRowBands(projection: Float64Array, size: number): RowBand[] {
  // min, not sum: a band needs a top edge AND a bottom edge one icon size
  // below. App labels produce a strong edge with nothing beneath them, and a
  // sum would happily call that a row.
  const paired = new Float64Array(projection.length);
  for (let y = 0; y + size < projection.length; y++) {
    paired[y] = Math.min(projection[y]!, projection[y + size]!);
  }

  let strongest = 0;
  for (const value of paired) strongest = Math.max(strongest, value);
  if (strongest <= 0) return [];

  const candidates: RowBand[] = [];
  for (let y = 0; y < paired.length; y++) {
    const value = paired[y]!;
    if (value < strongest * 0.2) continue;
    let isPeak = true;
    for (let d = 1; d <= 3; d++) {
      if (paired[y - d] !== undefined && paired[y - d]! > value) { isPeak = false; break; }
      if (paired[y + d] !== undefined && paired[y + d]! > value) { isPeak = false; break; }
    }
    if (isPeak) candidates.push({ top: y, strength: value });
  }

  // Keep the strongest band in each neighbourhood of one icon size.
  const kept: RowBand[] = [];
  for (const band of [...candidates].sort((a, b) => b.strength - a.strength)) {
    if (kept.every((other) => Math.abs(other.top - band.top) >= size)) kept.push(band);
  }
  return kept.sort((a, b) => a.top - b.top);
}

export interface Lattice {
  readonly top: number;
  readonly pitch: number;
  readonly rows: number;
}

/**
 * The lattice that explains the most detected bands, breaking ties in favour of
 * the simplest explanation: the one implying the fewest rows.
 *
 * That tiebreak is what keeps the dock out. On a sparse page the dock's icons
 * form a perfectly good band, and a slightly wider pitch can reach it while
 * skipping the real bottom row - explaining just as many bands, but requiring
 * two more empty rows to do it. Aliasing is not a concern here because the
 * allowed pitch range is narrower than a factor of two, so a true pitch has no
 * fractions inside it.
 */
export function fitRowLattice(
  bands: readonly RowBand[],
  size: number,
  options: DetectOptions,
): Lattice | null {
  if (bands.length === 0) return null;
  if (bands.length === 1) {
    return { top: bands[0]!.top, pitch: size * options.minPitchRatio, rows: 1 };
  }

  const minPitch = size * options.minPitchRatio;
  const maxPitch = size * options.maxPitchRatio;
  const tolerance = options.latticeTolerance;

  let best:
    | { explained: Array<[number, number]>; pitch: number; strength: number; rows: number }
    | null = null;

  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const span = bands[j]!.top - bands[i]!.top;
      for (let k = 1; k < options.maxRows; k++) {
        const pitch = span / k;
        if (pitch < minPitch || pitch > maxPitch) continue;

        const explained: Array<[number, number]> = [];
        let strength = 0;
        for (const band of bands) {
          const index = Math.round((band.top - bands[i]!.top) / pitch);
          if (Math.abs(band.top - (bands[i]!.top + index * pitch)) > tolerance) continue;
          explained.push([index, band.top]);
          strength += band.strength;
        }
        if (explained.length < 2) continue;
        const indices = explained.map(([index]) => index);
        const rows = Math.max(...indices) - Math.min(...indices) + 1;
        const better =
          !best ||
          explained.length > best.explained.length ||
          (explained.length === best.explained.length &&
            (rows < best.rows || (rows === best.rows && strength > best.strength)));
        if (better) best = { explained, pitch, strength, rows };
      }
    }
  }
  if (!best || best.explained.length < 2) return null;

  // Refit top and pitch by least squares over the bands the lattice explains.
  const minIndex = Math.min(...best.explained.map(([index]) => index));
  const points = best.explained.map(([index, top]) => [index - minIndex, top] as const);
  const n = points.length;
  const meanI = points.reduce((a, [i]) => a + i, 0) / n;
  const meanT = points.reduce((a, [, t]) => a + t, 0) / n;
  let num = 0;
  let den = 0;
  for (const [i, t] of points) {
    num += (i - meanI) * (t - meanT);
    den += (i - meanI) ** 2;
  }
  const pitch = den === 0 ? best.pitch : num / den;
  const top = meanT - pitch * meanI;
  const rows = Math.max(...points.map(([i]) => i)) + 1;
  return { top, pitch, rows };
}

export function slotRect(grid: Grid, slot: Slot): Band & { top: number; bottom: number } {
  const start = grid.left + slot.column * grid.columnPitch;
  const top = grid.top + slot.row * grid.rowPitch;
  return { start, end: start + grid.size, top, bottom: top + grid.size };
}

/**
 * How much evidence there is that a slot holds an icon: the stronger of the
 * detail inside the icon square and the square's own outline against the
 * wallpaper (ADR-0008).
 *
 * Neither measurement alone covers every icon. A flat icon with a small glyph
 * -- Singpass, Phone, Messages -- has almost no interior detail once the mean
 * is taken over the whole square, and scores barely above blurred wallpaper.
 * The outline is what it does have. Interior detail is kept for the opposite
 * case, where a busy icon sits on wallpaper close to its own edge colour.
 */
function slotEvidence(
  field: GradientField,
  grid: Grid,
  slot: Slot,
  options: OccupancyOptions,
): number {
  const rect = slotRect(grid, slot);
  const trim = grid.size * options.inset;
  const inner = grid.size - 2 * trim;
  const interior = meanMagnitude(field, rect.start + trim, rect.top + trim, inner, inner);
  const outline = outlineMagnitude(
    field,
    rect.start,
    rect.top,
    grid.size,
    grid.size,
    grid.size * options.outline,
  );
  return Math.max(interior, outline);
}

export function scoreOccupancy(
  field: GradientField,
  grid: Grid,
  options: OccupancyOptions,
): number[][] {
  const scores: number[][] = [];
  for (let row = 0; row < grid.rows; row++) {
    const cells: number[] = [];
    for (let column = 0; column < grid.columns; column++) {
      cells.push(slotEvidence(field, grid, { column, row }, options));
    }
    scores.push(cells);
  }
  return scores;
}

/**
 * Split the slot scores where they most obviously separate, rather than at a
 * constant fitted to two screenshots. Icon complexity varies several-fold
 * between apps, so a fraction of the strongest score would drop the plainest
 * icons; the gap between occupied and empty is far more stable than either end.
 */
export function occupancyThreshold(
  scores: readonly (readonly number[])[],
  options: OccupancyOptions,
): number {
  const sorted = scores.flatMap((row) => [...row]).sort((a, b) => b - a);
  if (sorted.length < 2) return options.floor;

  let bestRatio = 0;
  let bestSplit = 0;
  for (let k = 1; k < sorted.length; k++) {
    const above = sorted[k - 1]!;
    if (above < options.floor) break;
    const ratio = above / Math.max(sorted[k]!, 1e-6);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestSplit = k;
    }
  }
  if (bestRatio < options.minGapRatio) return options.floor;
  return Math.max(options.floor, (sorted[bestSplit - 1]! + sorted[bestSplit]!) / 2);
}

export function detectGrid(
  field: GradientField,
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): GridDetection {
  const columnFit = searchColumns(columnProjection(field), field.width, options);
  if (!columnFit) throw new GridNotFoundError('columns');
  const columns = snapColumns(columnProjection(field), columnFit, options.columns);

  const bands: Band[] = [];
  for (let i = 0; i < options.columns; i++) {
    const start = columns.left + i * columns.pitch;
    bands.push({ start, end: start + columns.size });
  }

  const rowBands = detectRowBands(rowProjection(field, bands), Math.round(columns.size));
  const lattice = fitRowLattice(rowBands, columns.size, options);
  if (!lattice) throw new GridNotFoundError('rows');

  const grid: Grid = {
    left: columns.left,
    top: lattice.top,
    size: columns.size,
    columnPitch: columns.pitch,
    rowPitch: lattice.pitch,
    columns: options.columns,
    rows: lattice.rows,
  };

  const scores = scoreOccupancy(field, grid, options.occupancy);
  const threshold = occupancyThreshold(scores, options.occupancy);
  const occupied: Slot[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      if (scores[row]![column]! >= threshold) occupied.push({ column, row });
    }
  }

  return { grid, occupied, scores, threshold };
}
