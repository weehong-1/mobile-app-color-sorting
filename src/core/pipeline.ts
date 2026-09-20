/**
 * The thin wiring between the pure modules: detect, crop, analyse, sort.
 *
 * This is where the two coordinate spaces of ADR-0001 meet. Detection runs on a
 * working copy of at most `maxWorkingWidth` pixels, and the grid it returns is
 * scaled back into screenshot coordinates before anything touches a pixel, so
 * cropping and colour analysis only ever see the real, un-resampled image.
 */
import { type AnalysisOptions, type IconColor, DEFAULT_ANALYSIS_OPTIONS, analyseSprite } from './analysis.ts';
import { type GradientField, gradientField } from './gradient.ts';
import {
  type DetectOptions,
  type Grid,
  type Slot,
  DEFAULT_DETECT_OPTIONS,
  detectGrid,
  occupancyThreshold,
  scoreOccupancy,
  slotRect,
} from './grid.ts';
import { type LabelPlacement, type Placement, compose } from './compose.ts';
import { type Label, type LabelOptions, DEFAULT_LABEL_OPTIONS, extractLabel } from './label.ts';
import { type Arranged, type LayoutMode, DEFAULT_LAYOUT, arrange } from './layout.ts';
import { type Raster, type Rect, downscale } from './raster.ts';
import { type SortOptions, type AnalysedIcon, DEFAULT_SORT_OPTIONS, sortIcons } from './sort.ts';
import { type Sprite, type SpriteOptions, DEFAULT_SPRITE_OPTIONS, extractSprite } from './sprite.ts';

export interface PipelineOptions {
  /** Detection runs on a copy no wider than this. */
  readonly maxWorkingWidth: number;
  readonly detect: DetectOptions;
  readonly sprite: SpriteOptions;
  readonly analysis: AnalysisOptions;
  readonly sort: SortOptions;
  readonly label: LabelOptions;
  readonly layout: LayoutMode;
}

export const DEFAULT_PIPELINE_OPTIONS: PipelineOptions = {
  maxWorkingWidth: 1600,
  detect: DEFAULT_DETECT_OPTIONS,
  sprite: DEFAULT_SPRITE_OPTIONS,
  analysis: DEFAULT_ANALYSIS_OPTIONS,
  sort: DEFAULT_SORT_OPTIONS,
  label: DEFAULT_LABEL_OPTIONS,
  layout: DEFAULT_LAYOUT,
};

export interface AnalysedIconDetail {
  readonly slot: Slot;
  /** The slot's square in screenshot coordinates, before insetting. */
  readonly rect: Rect;
  readonly sprite: Sprite;
  readonly color: IconColor;
  /** The app name under this icon, when one could be recovered. */
  readonly label: Label | null;
}

export interface AnalysedScreenshot {
  /** In screenshot coordinates, already scaled up from the working copy. */
  readonly grid: Grid;
  readonly icons: readonly AnalysedIconDetail[];
  /** Occupancy score per slot, indexed [row][column]. */
  readonly scores: readonly (readonly number[])[];
  readonly threshold: number;
  /** Icon indices in sorted order; each index points into `icons`. */
  readonly order: readonly AnalysedIcon[];
  /** Which slot each icon is drawn into, decided by the layout. */
  readonly arrangement: readonly Arranged[];
}

function scaleGrid(grid: Grid, factor: number): Grid {
  if (factor === 1) return grid;
  return {
    ...grid,
    left: grid.left * factor,
    top: grid.top * factor,
    size: Math.round(grid.size * factor),
    columnPitch: grid.columnPitch * factor,
    rowPitch: grid.rowPitch * factor,
  };
}

/**
 * The screenshot, its working copy and that copy's gradient field, kept
 * together so the app can re-score a manually adjusted grid without decoding or
 * differentiating the image again.
 */
export interface Workspace {
  readonly raster: Raster;
  readonly working: Raster;
  readonly field: GradientField;
  /** Multiply a working-copy coordinate by this to get a screenshot one. */
  readonly scale: number;
}

export function createWorkspace(
  raster: Raster,
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): Workspace {
  const working =
    raster.width > options.maxWorkingWidth ? downscale(raster, options.maxWorkingWidth) : raster;
  return { raster, working, field: gradientField(working), scale: raster.width / working.width };
}

export interface GridResult {
  readonly grid: Grid;
  readonly occupied: readonly Slot[];
  readonly scores: readonly (readonly number[])[];
  readonly threshold: number;
}

/** Detects the grid, in screenshot coordinates. */
export function detectGridIn(
  workspace: Workspace,
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): GridResult {
  const detection = detectGrid(workspace.field, options.detect);
  return {
    grid: scaleGrid(detection.grid, workspace.scale),
    occupied: detection.occupied,
    scores: detection.scores,
    threshold: detection.threshold,
  };
}

/**
 * Re-scores occupancy for a grid the user has adjusted by hand. Cell toggles
 * are not preserved by the caller across this, because the rectangles they
 * described have moved.
 */
export function scoreGridIn(
  workspace: Workspace,
  grid: Grid,
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): GridResult {
  const inWorking = scaleGrid(grid, 1 / workspace.scale);
  const scores = scoreOccupancy(workspace.field, inWorking, options.detect.occupancy);
  const threshold = occupancyThreshold(scores, options.detect.occupancy);
  const occupied: Slot[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      if (scores[row]![column]! >= threshold) occupied.push({ column, row });
    }
  }
  return { grid, occupied, scores, threshold };
}

export function detectGridForScreenshot(
  raster: Raster,
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): GridResult {
  return detectGridIn(createWorkspace(raster, options), options);
}

/** Crops and analyses the icons at the given slots, in reading order. */
export function analyseSlots(
  raster: Raster,
  grid: Grid,
  occupied: readonly Slot[],
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): AnalysedIconDetail[] {
  return [...occupied]
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .map((slot) => {
      const band = slotRect(grid, slot);
      const rect: Rect = { x: band.start, y: band.top, width: grid.size, height: grid.size };
      const sprite = extractSprite(raster, rect, options.sprite);
      return {
        slot,
        rect,
        sprite,
        color: analyseSprite(sprite, options.analysis),
        label: extractLabel(raster, sprite.iconRect, options.label),
      };
    });
}

/**
 * Turns the arrangement into sprite placements. Must read the same
 * `arrangement` that `planLabels` reads, or a label lands under a different
 * icon than the one it belongs to.
 */
export function planLayout(analysed: AnalysedScreenshot): Placement[] {
  return analysed.arrangement.map((entry) => {
    const icon = analysed.icons[entry.index]!;
    const inset = icon.sprite.iconRect.x - icon.rect.x;
    return { sprite: icon.sprite, iconX: entry.rect.x + inset, iconY: entry.rect.y + inset };
  });
}

export interface ComposeSortedOptions {
  /** Encoded channels in the screenshot's own colour space. */
  readonly background: readonly [number, number, number];
  /** Omit to leave labels out, which is the default. */
  readonly labelColor?: readonly [number, number, number];
}

/** Labels travel with their icons, keeping their offset from the icon square. */
export function planLabels(
  analysed: AnalysedScreenshot,
  color: readonly [number, number, number],
): LabelPlacement[] {
  const placements: LabelPlacement[] = [];
  for (const entry of analysed.arrangement) {
    const icon = analysed.icons[entry.index]!;
    if (!icon.label) continue;
    const inset = icon.sprite.iconRect.x - icon.rect.x;
    placements.push({
      label: icon.label,
      x: entry.rect.x + inset + icon.label.offsetX,
      y: entry.rect.y + inset + icon.label.offsetY,
      color,
    });
  }
  return placements;
}

export function composeSorted(
  raster: Raster,
  analysed: AnalysedScreenshot,
  options: ComposeSortedOptions,
): Raster {
  return compose(
    {
      width: raster.width,
      height: raster.height,
      space: raster.space,
      background: options.background,
    },
    planLayout(analysed),
    options.labelColor ? planLabels(analysed, options.labelColor) : [],
  );
}

/**
 * Sorts and arranges icons that have already been cropped and measured. The app
 * manages its own grid and occupancy, so it comes in here rather than through
 * `analyseScreenshot`.
 */
/** Occupancy output, which only a full detection run has to hand. */
export interface OccupancyReport {
  readonly scores: readonly (readonly number[])[];
  readonly threshold: number;
}

const NO_OCCUPANCY_REPORT: OccupancyReport = { scores: [], threshold: 0 };

export function arrangeIcons(
  grid: Grid,
  icons: readonly AnalysedIconDetail[],
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
  occupancy: OccupancyReport = NO_OCCUPANCY_REPORT,
): AnalysedScreenshot {
  const order = sortIcons(
    icons.map((icon, index) => ({ index, color: icon.color })),
    options.sort,
  );
  return {
    grid,
    icons,
    scores: occupancy.scores,
    threshold: occupancy.threshold,
    order,
    arrangement: arrange(grid, icons, order, options.layout, options.sort),
  };
}

export function analyseScreenshot(
  raster: Raster,
  options: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): AnalysedScreenshot {
  const { grid, occupied, scores, threshold } = detectGridForScreenshot(raster, options);
  const icons = analyseSlots(raster, grid, occupied, options);
  return arrangeIcons(grid, icons, options, { scores, threshold });
}
