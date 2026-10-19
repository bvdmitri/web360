import type { LensOptics } from '../model/recording';
import type { Vector3 } from '../shared/math/quaternion';
import { toDirection } from './equirectangular';
import type { Grid } from './gains';
import { sampleLens, type LensSampler, type Rgb } from './render';
import { stitchSample } from './sample';

const PIXEL_CENTRE = 0.5;
const CHANNELS = 3;
const BLACK: Rgb = [0, 0, 0];

interface Pair {
  readonly x: number;
  readonly y: number;
}

/**
 * Estimates how strongly the lenses darken toward their edges, from where two of them overlap.
 *
 * @remarks Fisheyes record less light toward the rim, and the seam sits on the rim of both lenses,
 * so it shows as a dark band even after exposure is matched. The falloff is modelled as
 * `exp(-strength * reach^2)`, the same for every lens, with `reach` running from 0 at a lens's
 * centre to 1 at its fisheye edge. Across the overlap one lens is nearer its edge than the other,
 * so the log ratio of the two lenses' brightness rises linearly with the difference of their
 * squared reach; the slope of that line (by least squares) is the strength, and the intercept
 * absorbs the lenses' different exposures. A positive strength darkens the rim. Without an overlap,
 * or where a lens records no light, there is nothing to measure and the strength is 0.
 */
export function estimateVignetting(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  grid: Grid,
): number {
  const pairs: Pair[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const direction = toDirection(
        (x + PIXEL_CENTRE) / grid.width,
        (y + PIXEL_CENTRE) / grid.height,
      );
      pairs.push(...pairAt(lenses, samplers, direction));
    }
  }
  return slopeOf(pairs);
}

/**
 * Wraps each lens's sampler so it undoes the edge falloff {@link estimateVignetting} measured.
 *
 * @remarks The correction depends only on how far a pixel sits from its lens centre, so it is applied
 * to the lens image before anything else; exposure is then matched on the flattened lenses. A lens
 * without a sampler reads black.
 */
export function devignette(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  strength: number,
): LensSampler[] {
  return lenses.map((lens, index) => {
    const sampler = samplers[index];
    return sampler === undefined ? (): Rgb => BLACK : flattened(lens, sampler, strength);
  });
}

function flattened(lens: LensOptics, sampler: LensSampler, strength: number): LensSampler {
  return (pixel) => {
    const reach = Math.hypot(pixel[0] - lens.center[0], pixel[1] - lens.center[1]) / lens.radius;
    const boost = Math.exp(strength * reach * reach);
    const [r, g, b] = sampler(pixel);
    return [r * boost, g * boost, b * boost];
  };
}

function pairAt(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  direction: Vector3,
): Pair[] {
  const [first, second] = stitchSample(lenses, direction);
  if (first === undefined || second === undefined) return [];
  const a = luminance(sampleLens(samplers, first.lens, first.pixel));
  const b = luminance(sampleLens(samplers, second.lens, second.pixel));
  return a > 0 && b > 0
    ? [{ x: second.reach ** 2 - first.reach ** 2, y: Math.log(a) - Math.log(b) }]
    : [];
}

function luminance(colour: Rgb): number {
  return (colour[0] + colour[1] + colour[2]) / CHANNELS;
}

function slopeOf(pairs: readonly Pair[]): number {
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const pair of pairs) {
    sumX += pair.x;
    sumY += pair.y;
    sumXX += pair.x * pair.x;
    sumXY += pair.x * pair.y;
  }
  const spread = pairs.length * sumXX - sumX * sumX;
  return spread > 0 ? (pairs.length * sumXY - sumX * sumY) / spread : 0;
}
