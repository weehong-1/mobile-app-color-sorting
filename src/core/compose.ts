/**
 * Drawing the sorted icons onto a solid background.
 *
 * This writes into a plain RGBA buffer rather than calling canvas drawing APIs
 * (ADR-0002), so the browser and the test suite produce the same bytes and the
 * pixel-level acceptance criteria are testable in Node. Where a sprite's mask
 * is fully on, the destination pixel is a literal copy of the source, so "icon
 * pixels match the screenshot" is true by construction rather than by
 * approximation.
 */
import type { ColorSpace } from './color.ts';
import type { Label } from './label.ts';
import { type Raster, createRaster } from './raster.ts';
import type { Sprite } from './sprite.ts';

export interface Placement {
  readonly sprite: Sprite;
  /** Where the sprite's icon square goes, in output coordinates. */
  readonly iconX: number;
  readonly iconY: number;
}

export interface LabelPlacement {
  readonly label: Label;
  /** Where the label strip's top-left corner goes, in output coordinates. */
  readonly x: number;
  readonly y: number;
  /** Encoded channels in the output's colour space. */
  readonly color: readonly [number, number, number];
}

export interface ComposeOptions {
  readonly width: number;
  readonly height: number;
  readonly space: ColorSpace;
  /** Encoded channels in `space`, not sRGB. */
  readonly background: readonly [number, number, number];
}

export function compose(
  options: ComposeOptions,
  placements: readonly Placement[],
  labels: readonly LabelPlacement[] = [],
): Raster {
  const output = createRaster(options.width, options.height, options.space);
  const [br, bg, bb] = options.background;
  for (let i = 0; i < options.width * options.height; i++) {
    const p = i * 4;
    output.data[p] = br;
    output.data[p + 1] = bg;
    output.data[p + 2] = bb;
    output.data[p + 3] = 255;
  }

  for (const placement of placements) drawSprite(output, placement);
  for (const label of labels) drawLabel(output, label);
  return output;
}

/**
 * Draws a recovered label in a flat colour. The alpha came from solving for how
 * much white was laid over the wallpaper, so redrawing it in another colour
 * keeps the original letterforms and antialiasing without carrying any of the
 * wallpaper along with them.
 */
export function drawLabel(output: Raster, placement: LabelPlacement): void {
  const { label, color } = placement;
  const originX = Math.round(placement.x);
  const originY = Math.round(placement.y);

  for (let y = 0; y < label.bounds.height; y++) {
    const destY = originY + y;
    if (destY < 0 || destY >= output.height) continue;
    for (let x = 0; x < label.bounds.width; x++) {
      const alpha = label.alpha[y * label.bounds.width + x]!;
      if (alpha <= 0) continue;
      const destX = originX + x;
      if (destX < 0 || destX >= output.width) continue;
      const to = (destY * output.width + destX) * 4;
      for (let c = 0; c < 3; c++) {
        output.data[to + c] = output.data[to + c]! * (1 - alpha) + color[c]! * alpha;
      }
      output.data[to + 3] = 255;
    }
  }
}

/**
 * Alpha-blends one sprite through its coverage mask. Anything falling outside
 * the canvas is clipped, which is what a badge overhanging the rightmost column
 * needs.
 */
export function drawSprite(output: Raster, placement: Placement): void {
  const { sprite, iconX, iconY } = placement;
  // The sprite's own bounds may start above and left of its icon square.
  const originX = Math.round(iconX + (sprite.bounds.x - sprite.iconRect.x));
  const originY = Math.round(iconY + (sprite.bounds.y - sprite.iconRect.y));

  for (let y = 0; y < sprite.bounds.height; y++) {
    const destY = originY + y;
    if (destY < 0 || destY >= output.height) continue;
    for (let x = 0; x < sprite.bounds.width; x++) {
      const alpha = sprite.mask[y * sprite.bounds.width + x]!;
      if (alpha <= 0) continue;
      const destX = originX + x;
      if (destX < 0 || destX >= output.width) continue;

      const from = (y * sprite.bounds.width + x) * 4;
      const to = (destY * output.width + destX) * 4;
      if (alpha >= 1) {
        output.data[to] = sprite.pixels[from]!;
        output.data[to + 1] = sprite.pixels[from + 1]!;
        output.data[to + 2] = sprite.pixels[from + 2]!;
      } else {
        for (let c = 0; c < 3; c++) {
          output.data[to + c] =
            output.data[to + c]! * (1 - alpha) + sprite.pixels[from + c]! * alpha;
        }
      }
      output.data[to + 3] = 255;
    }
  }
}
