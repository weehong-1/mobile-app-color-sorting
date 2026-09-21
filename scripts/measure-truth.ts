/**
 * Measures each icon's bounds directly from its own pixels and writes the
 * result to fixtures/<name>.truth.json.
 *
 * Deliberately independent of the detector: instead of reading a global
 * projection, this takes scanlines through a single icon and finds the
 * sub-pixel centroid of the luma gradient at each of its four edges. That gives
 * a datum the detector can be measured against without grading its own work.
 *
 * Run with: node --experimental-strip-types scripts/measure-truth.ts
 */
import { writeFileSync } from 'node:fs';
import { gradientField } from '../src/core/gradient.ts';
import { DEFAULT_DETECT_OPTIONS, detectGrid, slotRect } from '../src/core/grid.ts';
import { toLuma } from '../src/core/raster.ts';
import { FIXTURES, readPng } from '../src/test-support/png.ts';

const WINDOW = 10;

/**
 * Sub-pixel edge position: the strongest gradient in a window around the
 * approximate edge, refined by fitting a parabola through that sample and its
 * two neighbours.
 *
 * Picking the peak rather than the window's centroid matters for icons with
 * detail close to their border -- a solid tile with interior stripes puts two
 * strong gradients inside the window, and a centroid would report a position
 * between them that belongs to neither.
 */
function edgePeak(samples: Float64Array, origin: number): number | null {
  let peakAt = -1;
  let peak = 0;
  for (const [i, value] of samples.entries()) {
    if (value > peak) { peak = value; peakAt = i; }
  }
  if (peakAt <= 0 || peakAt >= samples.length - 1) return peakAt < 0 ? null : origin + peakAt;

  const before = samples[peakAt - 1]!;
  const after = samples[peakAt + 1]!;
  const denominator = before - 2 * peak + after;
  const offset = denominator === 0 ? 0 : (0.5 * (before - after)) / denominator;
  return origin + peakAt + Math.max(-1, Math.min(1, offset));
}

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function measureIcon(
  luma: Float32Array,
  width: number,
  height: number,
  approx: { left: number; top: number; right: number; bottom: number },
): Bounds | null {
  const cx = (approx.left + approx.right) / 2;
  const cy = (approx.top + approx.bottom) / 2;
  const half = (approx.right - approx.left) * 0.3;

  const vertical = (atX: number): number | null => {
    const from = Math.round(atX) - WINDOW;
    const samples = new Float64Array(WINDOW * 2 + 1);
    for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
      if (y < 1 || y >= height - 1) continue;
      for (let i = 0; i < samples.length; i++) {
        const x = from + i;
        if (x < 1 || x >= width - 1) continue;
        samples[i]! += Math.abs(luma[y * width + x + 1]! - luma[y * width + x - 1]!);
      }
    }
    return edgePeak(samples, from);
  };

  const horizontal = (atY: number): number | null => {
    const from = Math.round(atY) - WINDOW;
    const samples = new Float64Array(WINDOW * 2 + 1);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      if (x < 1 || x >= width - 1) continue;
      for (let i = 0; i < samples.length; i++) {
        const y = from + i;
        if (y < 1 || y >= height - 1) continue;
        samples[i]! += Math.abs(luma[(y + 1) * width + x]! - luma[(y - 1) * width + x]!);
      }
    }
    return edgePeak(samples, from);
  };

  const left = vertical(approx.left);
  const right = vertical(approx.right);
  const top = horizontal(approx.top);
  const bottom = horizontal(approx.bottom);
  if (left === null || right === null || top === null || bottom === null) return null;
  return { left, top, right, bottom };
}

/**
 * Edges the scanline measurement cannot see, read by hand off the pixel rows
 * and columns either side of them instead.
 *
 * Healthy 365 is a white card on pale blue wallpaper with a grey rim a few
 * pixels inside its own left and right edges, and a green strip along its
 * bottom. Every one of those is a stronger gradient than the edge it hides,
 * and all of them fall inside the search window, so `edgePeak` reports the
 * decoration rather than the icon. Nothing in the detector has this problem --
 * it never looks at one icon alone -- but the truth file has to be right about
 * it before it can grade anything.
 */
const CORRECTIONS: Record<string, Record<string, Bounds>> = {
  flat: {
    'Healthy 365': { left: 94.39, top: 869.8, right: 286.47, bottom: 1060.5 },
  },
};

const NAMES: Record<string, readonly string[]> = {
  dense: [
    '1Password', 'Owlfiles', 'DeepL', 'Youdao', 'Gemini', 'DeepSeek', 'ChatGPT', 'Claude',
    'Gmail', 'Spark', 'Telegram', 'WhatsApp', 'WeChat', 'Simplenote', 'UpNote', 'VoiceRecorder',
  ],
  sparse: ['Endel', 'Spotify', 'QQMusic', 'TickTick', 'MinimaList', 'Todoist', 'Meitu', '轻颜'],
  flat: [
    'SC Mobile', 'Authenticator', 'MyICA Mobile', 'MyNIISe',
    'MyPB', 'SP', '中国移动', 'Great Eastern',
    'Healthy 365', 'Donate Blood', 'CPF Mobile', 'Maxis',
    'TNG eWallet', 'Alipay', 'Singpass', 'OCBC',
    'OCBC Business', 'AIA+', 'MySingtel', 'DBS digibank',
    'DBS PayLah!',
  ],
};

for (const [name, path] of Object.entries(FIXTURES)) {
  const raster = readPng(path);
  const luma = toLuma(raster);
  const detection = detectGrid(gradientField(raster), DEFAULT_DETECT_OPTIONS);

  const icons = detection.occupied.map((slot, index) => {
    const rect = slotRect(detection.grid, slot);
    const iconName = NAMES[name]?.[index] ?? `slot-${slot.column}-${slot.row}`;
    const measured =
      CORRECTIONS[name]?.[iconName] ??
      measureIcon(luma, raster.width, raster.height, {
        left: rect.start, top: rect.top, right: rect.end, bottom: rect.bottom,
      });
    if (!measured) throw new Error(`Could not measure ${name} slot ${slot.column},${slot.row}`);
    return {
      name: iconName,
      column: slot.column,
      row: slot.row,
      left: +measured.left.toFixed(2),
      top: +measured.top.toFixed(2),
      right: +measured.right.toFixed(2),
      bottom: +measured.bottom.toFixed(2),
      width: +(measured.right - measured.left).toFixed(2),
      height: +(measured.bottom - measured.top).toFixed(2),
    };
  });

  const widths = icons.map((i) => i.width).sort((a, b) => a - b);
  const heights = icons.map((i) => i.height).sort((a, b) => a - b);
  console.log(`\n=== ${name} ===`);
  console.log(`median icon size: ${widths[widths.length >> 1]} x ${heights[heights.length >> 1]}`);
  for (const icon of icons) {
    console.log(
      `  ${icon.name.padEnd(14)} (${icon.column},${icon.row})  ` +
        `left ${icon.left.toFixed(1).padStart(7)}  top ${icon.top.toFixed(1).padStart(7)}  ` +
        `${icon.width.toFixed(1)} x ${icon.height.toFixed(1)}`,
    );
  }

  const out = `fixtures/${path.split('/').pop()!.replace(/\.PNG$/i, '')}.truth.json`;
  writeFileSync(out, `${JSON.stringify({ source: path, width: raster.width, height: raster.height, icons }, null, 2)}\n`);
  console.log(`wrote ${out}`);
}
