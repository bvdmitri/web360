import type { LensOptics } from '../model/recording';
import type { Vector3 } from '../shared/math/quaternion';
import { toDirection } from './equirectangular';
import type { Grid } from './overlap';
import { sampleLens, type LensSampler, type Rgb } from './render';
import { stitchSample } from './sample';

const PIXEL_CENTRE = 0.5;
const UNITY: Rgb = [1, 1, 1];

interface Seen {
  readonly lens: number;
  readonly colour: Rgb;
}

/**
 * Estimates a per-lens, per-channel gain that makes the lenses agree where they overlap.
 *
 * @remarks Two lenses meter the scene separately, so the same wall comes out brighter in one than
 * the other and the seam shows as a step. This samples the directions on `grid` that two or more
 * lenses see, averages what each lens records there, and scales every lens so its average lands on
 * the geometric mean of all of them: the seam band then matches while the overall brightness stays
 * where the camera put it. A lens that shares no overlap keeps unit gain, and a channel any lens
 * records as black is left unmatched rather than divided by zero. Apply the result as
 * {@link Scene.gains}.
 */
export function estimateGains(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  grid: Grid,
): Rgb[] {
  const seen = overlapColours(lenses, samplers, grid);
  const means = Array.from(lenses.keys(), (index) =>
    meanOf(seen.filter((one) => one.lens === index)),
  );
  const present = means.filter((mean): mean is Rgb => mean !== undefined);
  return means.map((mean) => (mean === undefined ? UNITY : gainFor(mean, present)));
}

function overlapColours(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  grid: Grid,
): Seen[] {
  const seen: Seen[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const direction = toDirection(
        (x + PIXEL_CENTRE) / grid.width,
        (y + PIXEL_CENTRE) / grid.height,
      );
      seen.push(...seenInOverlap(lenses, samplers, direction));
    }
  }
  return seen;
}

function seenInOverlap(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  direction: Vector3,
): Seen[] {
  const samples = stitchSample(lenses, direction);
  return samples.length < 2
    ? []
    : samples.map((one) => ({ lens: one.lens, colour: sampleLens(samplers, one.lens, one.pixel) }));
}

function meanOf(list: readonly Seen[]): Rgb | undefined {
  if (list.length === 0) return undefined;
  const total: [number, number, number] = [0, 0, 0];
  for (const one of list) {
    total[0] += one.colour[0];
    total[1] += one.colour[1];
    total[2] += one.colour[2];
  }
  return [total[0] / list.length, total[1] / list.length, total[2] / list.length];
}

function gainFor(mean: Rgb, present: readonly Rgb[]): Rgb {
  const channel = (index: 0 | 1 | 2): number => {
    const values = present.map((one) => one[index]);
    if (values.includes(0)) return 1;
    const logTotal = values.reduce((sum, value) => sum + Math.log(value), 0);
    return Math.exp(logTotal / values.length) / mean[index];
  };
  return [channel(0), channel(1), channel(2)];
}
