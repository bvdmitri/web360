import type { LensOptics } from '../model/recording';
import type { Vector3 } from '../shared/math/quaternion';
import { toDirection } from './equirectangular';
import { sampleLens, type LensSampler, type Rgb } from './render';
import { stitchSample } from './sample';

const PIXEL_CENTRE = 0.5;
const CHANNELS = 3;

/** The resolution of the direction grid the overlap is sampled on. */
export interface Grid {
  readonly width: number;
  readonly height: number;
}

/**
 * What the first two lenses that see one overlap direction record there, compared.
 *
 * @remarks `logRatio` is the log of the first lens's brightness over the second's, and
 * `reachSquaredGap` is the second lens's squared reach minus the first's (how much nearer its rim
 * the second lens is). Exposure differences shift `logRatio` by a constant, vignetting tilts it
 * along `reachSquaredGap`, and mis-registration or parallax scatters it. `innerReach` is the
 * smaller of the two lenses' reach, so the pairs' least `innerReach` is where the overlap begins.
 */
export interface OverlapPair {
  readonly logRatio: number;
  readonly reachSquaredGap: number;
  readonly innerReach: number;
}

/**
 * Samples the directions on `grid` that two lenses both see and compares what they record.
 *
 * @remarks A direction only one lens sees, or where either lens records no light, contributes
 * nothing.
 */
export function overlapPairs(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  grid: Grid,
): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const direction = toDirection(
        (x + PIXEL_CENTRE) / grid.width,
        (y + PIXEL_CENTRE) / grid.height,
      );
      pairs.push(...pairAt(lenses, samplers, direction));
    }
  }
  return pairs;
}

function pairAt(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  direction: Vector3,
): OverlapPair[] {
  const [first, second] = stitchSample(lenses, direction);
  if (first === undefined || second === undefined) return [];
  const a = luminance(sampleLens(samplers, first.lens, first.pixel));
  const b = luminance(sampleLens(samplers, second.lens, second.pixel));
  return a > 0 && b > 0
    ? [
        {
          logRatio: Math.log(a) - Math.log(b),
          reachSquaredGap: second.reach ** 2 - first.reach ** 2,
          innerReach: Math.min(first.reach, second.reach),
        },
      ]
    : [];
}

function luminance(colour: Rgb): number {
  return (colour[0] + colour[1] + colour[2]) / CHANNELS;
}
