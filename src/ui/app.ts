/**
 * The page. Everything interesting lives in the pure modules; this wires them
 * to the DOM, keeps the working state and decides what to recompute when.
 *
 * The state model is deliberately one-directional: geometry produces occupancy,
 * occupancy produces sprites and colours, colours produce an order, and the
 * order plus a background produce the output. Moving a slider re-runs occupancy
 * and drops any squares the person toggled, because those toggles described
 * rectangles that have since moved.
 */
import { contrastingText, convertRgb, hexToRgb, rgbToHex } from '../core/color.ts';
import { GridNotFoundError, type Grid, type Slot } from '../core/grid.ts';
import type { LayoutMode } from '../core/layout.ts';
import { type Palette, builtinPalette, parsePalette } from '../core/palette.ts';
import {
  type AnalysedIconDetail,
  type Workspace,
  DEFAULT_PIPELINE_OPTIONS,
  analyseSlots,
  arrangeIcons,
  composeSorted,
  createWorkspace,
  detectGridIn,
  scoreGridIn,
} from '../core/pipeline.ts';
import type { Raster } from '../core/raster.ts';
import type { SortMode } from '../core/sort.ts';
import { NEUTRAL_PRESETS, type Preset, wallpaperPresets } from './backgrounds.ts';
import { UnreadableImageError, decodeImage, exportPng, rasterToCanvas, supportsDisplayP3 } from './canvas.ts';
import { type Preferences, loadPreferences, savePreferences } from './preferences.ts';

const NO_ICONS_MESSAGE =
  'Found a grid but no icons in it. Try a different column count, or adjust the grid below.';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const slotKey = (slot: Slot) => `${slot.column},${slot.row}`;

interface Session {
  readonly file: Blob;
  readonly raster: Raster;
  readonly workspace: Workspace;
  /** The grid detection found, kept so "reset" has something to go back to. */
  readonly detected: Grid;
  grid: Grid;
  occupied: Slot[];
  icons: AnalysedIconDetail[];
  presets: Preset[];
}

export function start(): void {
  const preferences = loadPreferences();
  let session: Session | null = null;
  /** The composed output's object URL, and the untouched upload's. */
  let sortedUrl: string | null = null;
  let originalUrl: string | null = null;

  const ui = {
    theme: element<HTMLSelectElement>('theme'),
    file: element<HTMLInputElement>('file'),
    drop: element<HTMLDivElement>('drop'),
    error: element<HTMLParagraphElement>('error'),
    gridSection: element<HTMLElement>('step-grid-section'),
    gridCanvas: element<HTMLCanvasElement>('grid-canvas'),
    gridCells: element<HTMLDivElement>('grid-cells'),
    gridSummary: element<HTMLParagraphElement>('grid-summary'),
    columns: element<HTMLSelectElement>('columns'),
    resetGrid: element<HTMLButtonElement>('reset-grid'),
    optionsSection: element<HTMLElement>('step-options-section'),
    sortMode: element<HTMLSelectElement>('sort-mode'),
    whiteFirst: element<HTMLInputElement>('white-first'),
    darkThreshold: element<HTMLInputElement>('dark-threshold'),
    darkOut: element<HTMLOutputElement>('dark-out'),
    paletteSection: element<HTMLFieldSetElement>('palette-section'),
    paletteSwatches: element<HTMLDivElement>('palette-swatches'),
    paletteText: element<HTMLTextAreaElement>('palette-text'),
    paletteError: element<HTMLParagraphElement>('palette-error'),
    paletteApply: element<HTMLButtonElement>('palette-apply'),
    paletteReset: element<HTMLButtonElement>('palette-reset'),
    showLabels: element<HTMLInputElement>('show-labels'),
    labelColourField: element<HTMLDivElement>('label-colour-field'),
    labelColour: element<HTMLInputElement>('label-colour'),
    labelColourAuto: element<HTMLButtonElement>('label-colour-auto'),
    presets: element<HTMLDivElement>('presets'),
    background: element<HTMLInputElement>('background'),
    resultSection: element<HTMLElement>('step-result-section'),
    showBefore: element<HTMLButtonElement>('show-before'),
    showAfter: element<HTMLButtonElement>('show-after'),
    resultImage: element<HTMLImageElement>('result-image'),
    exportNote: element<HTMLParagraphElement>('export-note'),
    download: element<HTMLAnchorElement>('download'),
  };

  const layoutInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="layout"]')];

  const sliders = {
    left: element<HTMLInputElement>('left'),
    top: element<HTMLInputElement>('top'),
    size: element<HTMLInputElement>('size'),
    colpitch: element<HTMLInputElement>('colpitch'),
    rowpitch: element<HTMLInputElement>('rowpitch'),
  };
  const outputs = {
    left: element<HTMLOutputElement>('left-out'),
    top: element<HTMLOutputElement>('top-out'),
    size: element<HTMLOutputElement>('size-out'),
    colpitch: element<HTMLOutputElement>('colpitch-out'),
    rowpitch: element<HTMLOutputElement>('rowpitch-out'),
  };

  let view: 'before' | 'after' = 'after';
  let palette: Palette = builtinPalette();

  /**
   * Runs a synchronous chunk of pipeline work after letting the browser paint,
   * so the page dims rather than appearing to hang. The whole pipeline measures
   * around 180ms on a laptop for a 1284x2778 screenshot, and the interactive
   * path -- re-cropping after a square is toggled -- around 90ms, which is why
   * this work is still on the main thread.
   */
  async function busy<T>(work: () => T): Promise<T> {
    document.body.classList.add('busy');
    document.body.setAttribute('aria-busy', 'true');
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      return work();
    } finally {
      document.body.classList.remove('busy');
      document.body.removeAttribute('aria-busy');
    }
  }

  function applyTheme(): void {
    if (preferences.theme === 'system') delete document.documentElement.dataset['theme'];
    else document.documentElement.dataset['theme'] = preferences.theme;
  }

  function persist(): void {
    savePreferences(preferences);
  }

  function showError(message: string | null): void {
    ui.error.textContent = message ?? '';
    ui.error.hidden = message === null;
  }

  // --- loading ------------------------------------------------------------

  async function load(file: Blob): Promise<void> {
    showError(null);
    let raster: Raster;
    try {
      raster = await decodeImage(file);
    } catch (cause) {
      showError(cause instanceof UnreadableImageError
        ? cause.message
        : "This browser can't open that file. Save the screenshot as PNG or JPEG and try again.");
      return;
    }

    const workspace = createWorkspace(raster, DEFAULT_PIPELINE_OPTIONS);
    let grid: Grid;
    let occupied: Slot[];
    try {
      const detection = detectGridIn(workspace, options());
      grid = detection.grid;
      occupied = [...detection.occupied];
      if (occupied.length === 0) showError(NO_ICONS_MESSAGE);
    } catch (cause) {
      // Never a dead end: fall through to a plausible grid the person can drag
      // into place, rather than an empty screen.
      grid = guessGrid(raster, Number(ui.columns.value));
      occupied = [];
      showError(cause instanceof GridNotFoundError
        ? `${cause.message} The grid below is a starting guess.`
        : 'Could not find a grid. Adjust the sliders or pick a different column count.');
      openManualControls();
    }

    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = URL.createObjectURL(file);
    session = {
      file,
      raster,
      workspace,
      detected: grid,
      grid,
      occupied,
      icons: [],
      presets: [...NEUTRAL_PRESETS, ...wallpaperPresets(raster, raster.space)],
    };

    ui.gridSection.hidden = false;
    ui.optionsSection.hidden = false;
    drawScreenshot();
    syncSliderRanges();
    renderPresets();
    syncLabelControls();
    void refreshIcons();
  }

  /** A plausible starting grid for a phone screenshot, when detection fails. */
  function guessGrid(raster: Raster, columns: number): Grid {
    const size = Math.round(raster.width * 0.16);
    const pitch = raster.width * 0.23;
    return {
      left: Math.round(raster.width * 0.076),
      top: Math.round(raster.height * 0.078),
      size,
      columnPitch: pitch,
      rowPitch: size * 1.57,
      columns,
      rows: 6,
    };
  }

  function openManualControls(): void {
    element<HTMLDetailsElement>('manual').open = true;
  }

  // --- grid ---------------------------------------------------------------

  function drawScreenshot(): void {
    if (!session) return;
    const canvas = rasterToCanvas(session.raster);
    ui.gridCanvas.width = canvas.width;
    ui.gridCanvas.height = canvas.height;
    const context = ui.gridCanvas.getContext('2d');
    context?.drawImage(canvas, 0, 0);
  }

  function syncSliderRanges(): void {
    if (!session) return;
    const { raster, grid } = session;
    sliders.left.max = String(Math.round(raster.width * 0.4));
    sliders.top.max = String(Math.round(raster.height * 0.4));
    sliders.size.min = String(Math.round(raster.width * 0.05));
    sliders.size.max = String(Math.round(raster.width * 0.35));
    sliders.colpitch.min = String(Math.round(raster.width * 0.05));
    sliders.colpitch.max = String(Math.round(raster.width * 0.6));
    sliders.rowpitch.min = String(Math.round(raster.width * 0.05));
    sliders.rowpitch.max = String(Math.round(raster.height * 0.35));
    sliders.left.value = String(Math.round(grid.left));
    sliders.top.value = String(Math.round(grid.top));
    sliders.size.value = String(Math.round(grid.size));
    sliders.colpitch.value = String(Math.round(grid.columnPitch));
    sliders.rowpitch.value = String(Math.round(grid.rowPitch));
    syncSliderOutputs();
  }

  function syncSliderOutputs(): void {
    outputs.left.value = `${sliders.left.value}px`;
    outputs.top.value = `${sliders.top.value}px`;
    outputs.size.value = `${sliders.size.value}px`;
    outputs.colpitch.value = `${sliders.colpitch.value}px`;
    outputs.rowpitch.value = `${sliders.rowpitch.value}px`;
  }

  function renderCells(): void {
    if (!session) return;
    const { grid, raster, occupied } = session;
    const on = new Set(occupied.map(slotKey));
    ui.gridCells.replaceChildren();
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const x = grid.left + column * grid.columnPitch;
        const y = grid.top + row * grid.rowPitch;
        if (x + grid.size > raster.width || y + grid.size > raster.height) continue;
        const button = document.createElement('button');
        button.type = 'button';
        const key = slotKey({ column, row });
        const isOn = on.has(key);
        button.setAttribute('aria-pressed', String(isOn));
        button.setAttribute(
          'aria-label',
          `${isOn ? 'Included' : 'Excluded'}: row ${row + 1}, column ${column + 1}`,
        );
        button.style.left = `${(x / raster.width) * 100}%`;
        button.style.top = `${(y / raster.height) * 100}%`;
        button.style.width = `${(grid.size / raster.width) * 100}%`;
        button.style.height = `${(grid.size / raster.height) * 100}%`;
        button.addEventListener('click', () => toggleSlot({ column, row }));
        ui.gridCells.append(button);
      }
    }
  }

  function toggleSlot(slot: Slot): void {
    if (!session) return;
    const key = slotKey(slot);
    const index = session.occupied.findIndex((other) => slotKey(other) === key);
    if (index >= 0) session.occupied.splice(index, 1);
    else session.occupied.push(slot);
    void refreshIcons();
  }

  function rescoreFromSliders(): void {
    if (!session) return;
    const grid: Grid = {
      left: Number(sliders.left.value),
      top: Number(sliders.top.value),
      size: Number(sliders.size.value),
      columnPitch: Number(sliders.colpitch.value),
      rowPitch: Number(sliders.rowpitch.value),
      columns: Number(ui.columns.value),
      rows: session.grid.rows,
    };
    const rows = Math.max(
      1,
      Math.floor((session.raster.height - grid.top - grid.size) / grid.rowPitch) + 1,
    );
    const result = scoreGridIn(session.workspace, { ...grid, rows }, options());
    session.grid = result.grid;
    session.occupied = [...result.occupied];
    syncSliderOutputs();
    showError(result.occupied.length === 0 ? NO_ICONS_MESSAGE : null);
    void refreshIcons();
  }

  function redetect(): void {
    if (!session) return;
    try {
      const detection = detectGridIn(session.workspace, options());
      session.grid = detection.grid;
      session.occupied = [...detection.occupied];
      showError(detection.occupied.length === 0 ? NO_ICONS_MESSAGE : null);
    } catch {
      session.grid = guessGrid(session.raster, Number(ui.columns.value));
      session.occupied = [];
      showError('Could not find a grid. Adjust the sliders or pick a different column count.');
      openManualControls();
    }
    syncSliderRanges();
    void refreshIcons();
  }

  // --- analysis and output ------------------------------------------------

  function options() {
    return {
      ...DEFAULT_PIPELINE_OPTIONS,
      detect: { ...DEFAULT_PIPELINE_OPTIONS.detect, columns: Number(ui.columns.value) },
      analysis: {
        ...DEFAULT_PIPELINE_OPTIONS.analysis,
        darkMaxLightness: preferences.darkThreshold,
      },
      sort: { mode: preferences.sortMode, whiteFirst: preferences.whiteFirst, palette },
      layout: preferences.layout,
    };
  }

  async function refreshIcons(): Promise<void> {
    if (!session) return;
    const current = session;
    current.icons = await busy(() =>
      analyseSlots(current.raster, current.grid, current.occupied, options()),
    );
    renderCells();
    ui.gridSummary.textContent =
      current.icons.length === 0
        ? 'No icons selected yet.'
        : `${current.icons.length} icon${current.icons.length === 1 ? '' : 's'} found, ` +
          `${current.grid.columns} columns by ${current.grid.rows} rows.`;
    await refreshOutput();
  }

  /**
   * Composes the sorted image and points the result at it. The before view
   * shows the uploaded file itself rather than a re-encode of it, so switching
   * views never costs an encode and the download always offers the sorted
   * image regardless of which view is showing.
   */
  async function refreshOutput(): Promise<void> {
    if (!session || session.icons.length === 0) {
      ui.resultSection.hidden = true;
      ui.resultImage.removeAttribute('src');
      ui.download.removeAttribute('href');
      return;
    }
    const { raster } = session;
    const analysed = arrangeIcons(session.grid, session.icons, options());
    const background = convertRgb(hexToRgb(preferences.backgroundHex), 'srgb', raster.space);
    const labelColor = preferences.showLabels ? labelColour(background) : undefined;
    const composed = composeSorted(
      raster,
      analysed,
      labelColor ? { background, labelColor } : { background },
    );

    const exported = await exportPng(composed);
    if (sortedUrl) URL.revokeObjectURL(sortedUrl);
    sortedUrl = exported.url;
    ui.download.href = exported.url;
    ui.exportNote.hidden = exported.taggedCorrectly;
    ui.exportNote.textContent = exported.taggedCorrectly
      ? ''
      : 'Saved in the standard colour range, because this browser could not tag the wider one.';
    ui.resultSection.hidden = false;
    showCurrentView();
  }

  /**
   * The label colour: whatever contrasts with the background, unless the person
   * has chosen one. A label that extracts to almost nothing is simply drawn
   * faint or not at all -- the app only ever shows real pixels from the
   * screenshot, and substituting typed text would break that.
   */
  function labelColour(background: readonly [number, number, number]): [number, number, number] {
    if (!session) return [0, 0, 0];
    if (preferences.labelColourHex) {
      return convertRgb(hexToRgb(preferences.labelColourHex), 'srgb', session.raster.space);
    }
    return contrastingText(background, session.raster.space);
  }

  // --- palette -------------------------------------------------------------

  function renderPalette(): void {
    ui.paletteSection.hidden = preferences.sortMode !== 'families';
    ui.paletteSwatches.replaceChildren();
    for (const family of palette.families) {
      const row = document.createElement('div');
      row.className = 'family';
      for (const swatch of family.swatches) {
        const cell = document.createElement('span');
        cell.style.background = swatch.hex;
        cell.title = `${swatch.name} ${swatch.hex}`;
        row.append(cell);
      }
      ui.paletteSwatches.append(row);
    }
    ui.paletteSwatches.setAttribute(
      'aria-label',
      `${palette.name} palette: ${palette.families.length} families, ${palette.swatches.length} colours`,
    );
  }

  function showPaletteError(messages: readonly string[]): void {
    ui.paletteError.hidden = messages.length === 0;
    ui.paletteError.textContent = messages.join(' ');
  }

  function applyPalette(text: string | null): boolean {
    if (text === null || text.trim() === '') {
      palette = builtinPalette();
      showPaletteError([]);
      renderPalette();
      return true;
    }
    const { palette: parsed, errors } = parsePalette(text, 'Yours');
    if (!parsed) {
      showPaletteError(errors);
      return false;
    }
    palette = parsed;
    showPaletteError(errors);
    renderPalette();
    return true;
  }

  function syncLabelControls(): void {
    ui.showLabels.checked = preferences.showLabels;
    ui.labelColourField.hidden = !preferences.showLabels;
    if (preferences.labelColourHex) {
      ui.labelColour.value = preferences.labelColourHex;
    } else if (session) {
      const background = convertRgb(hexToRgb(preferences.backgroundHex), 'srgb', session.raster.space);
      const auto = contrastingText(background, session.raster.space);
      ui.labelColour.value = rgbToHex(...convertRgb(auto, session.raster.space, 'srgb'));
    }
  }

  function showCurrentView(): void {
    const url = view === 'before' ? originalUrl : sortedUrl;
    if (!url) return;
    ui.resultImage.src = url;
    ui.resultImage.alt =
      view === 'before' ? 'The original screenshot' : 'The screenshot with its icons sorted by colour';
  }

  function renderPresets(): void {
    if (!session) return;
    ui.presets.replaceChildren();
    for (const preset of session.presets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.background = preset.hex;
      button.title = preset.label;
      button.setAttribute('aria-label', preset.label);
      button.setAttribute(
        'aria-pressed',
        String(preset.hex.toLowerCase() === preferences.backgroundHex.toLowerCase()),
      );
      button.addEventListener('click', () => {
        preferences.backgroundHex = preset.hex;
        ui.background.value = preset.hex;
        persist();
        renderPresets();
        syncLabelControls();
        void refreshOutput();
      });
      ui.presets.append(button);
    }
  }

  function setView(next: 'before' | 'after'): void {
    view = next;
    ui.showBefore.setAttribute('aria-pressed', String(next === 'before'));
    ui.showAfter.setAttribute('aria-pressed', String(next === 'after'));
    showCurrentView();
  }

  // --- wiring -------------------------------------------------------------

  ui.theme.value = preferences.theme;
  ui.sortMode.value = preferences.sortMode;
  ui.whiteFirst.checked = preferences.whiteFirst;
  ui.darkThreshold.value = String(preferences.darkThreshold);
  ui.darkOut.value = preferences.darkThreshold.toFixed(2);
  ui.background.value = preferences.backgroundHex;
  for (const input of layoutInputs) input.checked = input.value === preferences.layout;
  if (preferences.paletteText !== null) {
    ui.paletteText.value = preferences.paletteText;
    // A stored palette that no longer parses falls back rather than blocking.
    if (!applyPalette(preferences.paletteText)) preferences.paletteText = null;
  }
  renderPalette();
  syncLabelControls();
  applyTheme();

  ui.theme.addEventListener('change', () => {
    preferences.theme = ui.theme.value as Preferences['theme'];
    applyTheme();
    persist();
  });

  ui.file.addEventListener('change', () => {
    const file = ui.file.files?.[0];
    if (file) void load(file);
  });

  for (const type of ['dragenter', 'dragover'] as const) {
    ui.drop.addEventListener(type, (event) => {
      event.preventDefault();
      ui.drop.classList.add('over');
    });
  }
  for (const type of ['dragleave', 'drop'] as const) {
    ui.drop.addEventListener(type, () => ui.drop.classList.remove('over'));
  }
  ui.drop.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void load(file);
  });

  ui.columns.addEventListener('change', redetect);
  ui.resetGrid.addEventListener('click', redetect);
  for (const slider of Object.values(sliders)) {
    slider.addEventListener('input', syncSliderOutputs);
    slider.addEventListener('change', rescoreFromSliders);
  }

  ui.sortMode.addEventListener('change', () => {
    preferences.sortMode = ui.sortMode.value as SortMode;
    persist();
    renderPalette();
    void refreshOutput();
  });

  ui.paletteApply.addEventListener('click', () => {
    if (!applyPalette(ui.paletteText.value)) return;
    preferences.paletteText = ui.paletteText.value.trim() === '' ? null : ui.paletteText.value;
    persist();
    void refreshOutput();
  });
  ui.paletteReset.addEventListener('click', () => {
    ui.paletteText.value = '';
    preferences.paletteText = null;
    applyPalette(null);
    persist();
    void refreshOutput();
  });
  ui.whiteFirst.addEventListener('change', () => {
    preferences.whiteFirst = ui.whiteFirst.checked;
    persist();
    void refreshOutput();
  });
  ui.darkThreshold.addEventListener('input', () => {
    ui.darkOut.value = Number(ui.darkThreshold.value).toFixed(2);
  });
  ui.darkThreshold.addEventListener('change', () => {
    preferences.darkThreshold = Number(ui.darkThreshold.value);
    persist();
    void refreshIcons();
  });
  ui.background.addEventListener('input', () => {
    preferences.backgroundHex = rgbToHex(...hexToRgb(ui.background.value));
    renderPresets();
    void refreshOutput();
  });
  ui.background.addEventListener('change', persist);

  for (const input of layoutInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      preferences.layout = input.value as LayoutMode;
      persist();
      void refreshOutput();
    });
  }

  ui.showLabels.addEventListener('change', () => {
    preferences.showLabels = ui.showLabels.checked;
    persist();
    syncLabelControls();
    void refreshOutput();
  });
  ui.labelColour.addEventListener('input', () => {
    preferences.labelColourHex = rgbToHex(...hexToRgb(ui.labelColour.value));
    void refreshOutput();
  });
  ui.labelColour.addEventListener('change', persist);
  ui.labelColourAuto.addEventListener('click', () => {
    preferences.labelColourHex = null;
    persist();
    syncLabelControls();
    void refreshOutput();
  });

  ui.showBefore.addEventListener('click', () => setView('before'));
  ui.showAfter.addEventListener('click', () => setView('after'));

  // Recorded for the README's note about colour handling; not shown in the UI,
  // because a person who did not ask about colour science should not be told
  // about it on a perfectly good result.
  if (!supportsDisplayP3()) {
    console.info('Display P3 canvas unavailable; working in sRGB.');
  }
}
