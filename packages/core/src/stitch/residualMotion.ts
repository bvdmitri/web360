import type { Rgb } from './sampler';

const CHANNELS = 3;
// A patch whose luminance varies less than this (variance) has no texture to follow.
const FLAT = 1e-4;
// Gauss-Newton steps refining a whole-pixel match to a fraction of a pixel.
const REFINEMENTS = 4;
// The patches sit in the middle half of the height: from a quarter of it down.
const BAND_TOP = 0.25;
const BAND_HEIGHT = 0.5;

/** A picture's luminance, row-major, for measuring how it moves. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly luminance: Float32Array;
}

/** How far one patch of a grid moved from one picture to the next, in pixels. */
export interface PatchShift {
  readonly cell: number;
  readonly shift: readonly [number, number];
}

/**
 * The grid of patches {@link patchShifts} follows: `columns` across the whole width (which wraps,
 * as an equirectangular frame does) and `rows` down the middle half of the height, each `size`
 * pixels square, searched within `reach` pixels either way.
 */
export interface PatchGrid {
  readonly columns: number;
  readonly rows: number;
  readonly size: number;
  readonly reach: number;
}

interface Pair {
  readonly from: Picture;
  readonly to: Picture;
}

interface Patch {
  readonly origin: readonly [number, number];
  readonly size: number;
}

/** A rendered picture as its luminance, the mean of its channels. */
export function luminanceOf(
  pixels: readonly Rgb[],
  size: { readonly width: number; readonly height: number },
): Picture {
  const luminance = new Float32Array(size.width * size.height);
  for (const [index, pixel] of pixels.entries()) {
    luminance[index] = (pixel[0] + pixel[1] + pixel[2]) / CHANNELS;
  }
  return { width: size.width, height: size.height, luminance };
}

/**
 * How far each textured patch of a grid moved from picture `a` to picture `b`, to a fraction of a
 * pixel.
 *
 * @remarks Each patch is matched by the least squared difference over whole-pixel offsets within
 * `reach`, then refined by a few Lucas-Kanade steps (least squares on the picture's gradient,
 * sampled bilinearly). Columns wrap around the picture's width; rows are clamped. A patch without
 * texture is left out, since any offset matches it. A developer's measure of residual motion
 * between stabilized frames (ADR 0023), not part of a rendition.
 */
export function patchShifts(a: Picture, b: Picture, grid: PatchGrid): PatchShift[] {
  const pair: Pair = { from: a, to: b };
  return cellsOf(a, grid)
    .filter(({ patch }) => varianceOf(a, patch) >= FLAT)
    .map(({ cell, patch }) => ({ cell, shift: shiftOf(pair, patch, grid.reach) }));
}

/**
 * The jitter in a run of frame-to-frame patch shifts: the root mean square change of each patch's
 * shift from one pair of frames to the next, in pixels.
 *
 * @remarks A steady pan shifts every pair alike and counts as none; a shake back and forth counts
 * fully. A patch is compared only with itself, and only where both pairs found it.
 */
export function jitterOf(series: readonly (readonly PatchShift[])[]): number {
  let total = 0;
  let count = 0;
  for (let index = 1; index < series.length; index += 1) {
    const change = changesBetween(series[index - 1] ?? [], series[index] ?? []);
    total += change.total;
    count += change.count;
  }
  return count === 0 ? 0 : Math.sqrt(total / count);
}

function changesBetween(
  before: readonly PatchShift[],
  after: readonly PatchShift[],
): { total: number; count: number } {
  const earlier = new Map(before.map((one) => [one.cell, one.shift]));
  let total = 0;
  let count = 0;
  for (const { cell, shift } of after) {
    const previous = earlier.get(cell);
    if (previous === undefined) continue;
    total += (shift[0] - previous[0]) ** 2 + (shift[1] - previous[1]) ** 2;
    count += 1;
  }
  return { total, count };
}

function cellsOf(picture: Picture, grid: PatchGrid): { cell: number; patch: Patch }[] {
  return Array.from({ length: grid.rows * grid.columns }, (...[, cell]) => {
    const [row, column] = [Math.floor(cell / grid.columns), cell % grid.columns];
    const top = BAND_TOP + (BAND_HEIGHT * (row + 1 / 2)) / grid.rows;
    const origin: [number, number] = [
      Math.round(((column + 1 / 2) * picture.width) / grid.columns - grid.size / 2),
      Math.round(picture.height * top - grid.size / 2),
    ];
    return { cell, patch: { origin, size: grid.size } };
  });
}

function at(picture: Picture, x: number, y: number): number {
  const column = ((x % picture.width) + picture.width) % picture.width;
  const row = Math.min(picture.height - 1, Math.max(0, y));
  return picture.luminance[row * picture.width + column] ?? 0;
}

// The pixels of a patch, row by row, as offsets from its origin.
function pixelsOf(size: number): (readonly [number, number])[] {
  return Array.from({ length: size * size }, (...[, index]) => [
    index % size,
    Math.floor(index / size),
  ]);
}

function varianceOf(picture: Picture, patch: Patch): number {
  let sum = 0;
  let squares = 0;
  for (const [x, y] of pixelsOf(patch.size)) {
    const value = at(picture, patch.origin[0] + x, patch.origin[1] + y);
    sum += value;
    squares += value * value;
  }
  const count = patch.size * patch.size;
  return squares / count - (sum / count) ** 2;
}

function difference(pair: Pair, patch: Patch, offset: readonly [number, number]): number {
  let total = 0;
  for (const [x, y] of pixelsOf(patch.size)) {
    const here = at(pair.from, patch.origin[0] + x, patch.origin[1] + y);
    const there = at(pair.to, patch.origin[0] + x + offset[0], patch.origin[1] + y + offset[1]);
    total += (here - there) ** 2;
  }
  return total;
}

function shiftOf(pair: Pair, patch: Patch, reach: number): readonly [number, number] {
  const side = 2 * reach + 1;
  let best: readonly [number, number] = [0, 0];
  let least = Infinity;
  for (let index = 0; index < side * side; index += 1) {
    const offset = [(index % side) - reach, Math.floor(index / side) - reach] as const;
    const value = difference(pair, patch, offset);
    if (value >= least) continue;
    least = value;
    best = offset;
  }
  let offset = best;
  for (let step = 0; step < REFINEMENTS; step += 1) offset = refined(pair, patch, offset);
  return offset;
}

// One Lucas-Kanade step: the offset that best cancels the patch's difference to first order.
function refined(
  pair: Pair,
  patch: Patch,
  offset: readonly [number, number],
): readonly [number, number] {
  let [xx, xy, yy, xr, yr] = [0, 0, 0, 0, 0];
  for (const [x, y] of pixelsOf(patch.size)) {
    const px = patch.origin[0] + x + offset[0];
    const py = patch.origin[1] + y + offset[1];
    const gx = (sample(pair.to, px + 1, py) - sample(pair.to, px - 1, py)) / 2;
    const gy = (sample(pair.to, px, py + 1) - sample(pair.to, px, py - 1)) / 2;
    const here = at(pair.from, patch.origin[0] + x, patch.origin[1] + y);
    const residual = sample(pair.to, px, py) - here;
    xx += gx * gx;
    xy += gx * gy;
    yy += gy * gy;
    xr += gx * residual;
    yr += gy * residual;
  }
  const determinant = xx * yy - xy * xy;
  return determinant <= 0
    ? offset
    : [
        offset[0] - (yy * xr - xy * yr) / determinant,
        offset[1] - (xx * yr - xy * xr) / determinant,
      ];
}

// The picture between pixels, bilinearly, wrapping across its width.
function sample(picture: Picture, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const top = at(picture, x0, y0) * (1 - fx) + at(picture, x0 + 1, y0) * fx;
  const bottom = at(picture, x0, y0 + 1) * (1 - fx) + at(picture, x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}
