import type { LensOptics } from '../model/recording';
import { toDirection } from './equirectangular';
import { sampleLens, type LensSampler, type Rgb } from './render';
import { stitchSample } from './sample';

const PIXEL_CENTRE = 0.5;
const HALF_PI = Math.PI / 2;
const CHANNELS = 3;

/**
 * A thin band of directions straddling the equator of the output frame: `width` longitudes by
 * `height` latitudes, spanning `halfAngle` radians either side.
 */
export interface Band {
  readonly width: number;
  readonly height: number;
  readonly halfAngle: number;
}

interface Pair {
  readonly a: number;
  readonly b: number;
}

/**
 * How well the first two lenses agree across the seam: the normalized cross-correlation of their
 * log brightness over a fixed band of directions.
 *
 * @remarks Each direction in `band` that both lenses see is sampled in each, and the two series of
 * log brightness are correlated. Exposure (a constant log offset) and contrast (a log scale) do not
 * change it; content landing in different places in the two lenses, from a wrong field of view or
 * pose, lowers it. Because the band is fixed rather than the whole overlap, candidates that widen or
 * narrow the overlap are compared on the same directions. It is meant to rank stitch parameters on
 * one frame (higher is better registered), not as an absolute score; parallax from anything close
 * to the camera lowers it whatever the parameters. With nothing to correlate (no shared directions,
 * no light, or a featureless band) it is 0. The band should sit on the seam, so the lenses' optical
 * axes should be near the output's poles.
 */
export function seamCorrelation(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  band: Band,
): number {
  const pairs: Pair[] = [];
  for (let y = 0; y < band.height; y += 1) {
    const latitude = band.halfAngle * (((y + PIXEL_CENTRE) / band.height) * 2 - 1);
    for (let x = 0; x < band.width; x += 1) {
      const direction = toDirection(
        (x + PIXEL_CENTRE) / band.width,
        (HALF_PI - latitude) / Math.PI,
      );
      pairs.push(...pairAt(lenses, samplers, direction));
    }
  }
  return correlation(pairs);
}

function pairAt(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  direction: readonly [number, number, number],
): Pair[] {
  const [first, second] = stitchSample(lenses, direction);
  if (first === undefined || second === undefined) return [];
  const a = luminance(sampleLens(samplers, first.lens, first.pixel));
  const b = luminance(sampleLens(samplers, second.lens, second.pixel));
  return a > 0 && b > 0 ? [{ a: Math.log(a), b: Math.log(b) }] : [];
}

function luminance(colour: Rgb): number {
  return (colour[0] + colour[1] + colour[2]) / CHANNELS;
}

function correlation(pairs: readonly Pair[]): number {
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  for (const pair of pairs) {
    sumA += pair.a;
    sumB += pair.b;
    sumAA += pair.a * pair.a;
    sumBB += pair.b * pair.b;
    sumAB += pair.a * pair.b;
  }
  const n = pairs.length;
  const spread = (n * sumAA - sumA * sumA) * (n * sumBB - sumB * sumB);
  return spread > 0 ? (n * sumAB - sumA * sumB) / Math.sqrt(spread) : 0;
}
