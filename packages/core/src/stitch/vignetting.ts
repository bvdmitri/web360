import type { LensOptics } from '../model/recording';
import { overlapPairs, type Grid, type OverlapPair } from './overlap';
import type { LensSampler, Rgb } from './render';

const BLACK: Rgb = [0, 0, 0];

/**
 * A lens edge falloff: brightness drops by `exp(-strength * (reach^2 - start^2))` beyond `start`,
 * and not at all inside it.
 */
export interface Vignetting {
  readonly strength: number;
  readonly start: number;
}

/**
 * Estimates how strongly the lenses darken toward their rims, from where two of them overlap.
 *
 * @remarks Fisheyes record less light toward the rim, and the seam sits on the rim of both lenses,
 * so it shows as a dark band even after exposure is matched. Across the overlap one lens is nearer
 * its rim than the other, so the log ratio of the two lenses' brightness rises linearly with the
 * difference of their squared reach; the slope of that line (by least squares) is the strength,
 * and the intercept absorbs the lenses' different exposures. The overlap only spans the rim, so it
 * says nothing about the falloff further in: the result starts at the innermost reach the overlap
 * covers, and {@link devignette} leaves everything inside that alone rather than extrapolating a
 * steep rim slope into the centre. The falloff is assumed the same for every lens. Without an
 * overlap, or where a lens records no light, the strength is 0.
 */
export function estimateVignetting(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  grid: Grid,
): Vignetting {
  const pairs = overlapPairs(lenses, samplers, grid);
  return { strength: slopeOf(pairs), start: innermostOf(pairs) };
}

/**
 * Wraps each lens's sampler so it undoes the rim falloff {@link estimateVignetting} measured.
 *
 * @remarks The correction depends only on how far a pixel sits from its lens centre, so it is applied
 * to the lens image before anything else; exposure is then matched on the flattened lenses. A lens
 * without a sampler reads black.
 */
export function devignette(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  vignetting: Vignetting,
): LensSampler[] {
  return lenses.map((lens, index) => {
    const sampler = samplers[index];
    return sampler === undefined ? (): Rgb => BLACK : flattened(lens, sampler, vignetting);
  });
}

function flattened(lens: LensOptics, sampler: LensSampler, vignetting: Vignetting): LensSampler {
  const startSquared = vignetting.start * vignetting.start;
  return (pixel) => {
    const reach = Math.hypot(pixel[0] - lens.center[0], pixel[1] - lens.center[1]) / lens.radius;
    const beyond = Math.max(0, reach * reach - startSquared);
    const boost = Math.exp(vignetting.strength * beyond);
    const [r, g, b] = sampler(pixel);
    return [r * boost, g * boost, b * boost];
  };
}

function innermostOf(pairs: readonly OverlapPair[]): number {
  let innermost = 1;
  for (const pair of pairs) innermost = Math.min(innermost, pair.innerReach);
  return innermost;
}

function slopeOf(pairs: readonly OverlapPair[]): number {
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const pair of pairs) {
    sumX += pair.reachSquaredGap;
    sumY += pair.logRatio;
    sumXX += pair.reachSquaredGap * pair.reachSquaredGap;
    sumXY += pair.reachSquaredGap * pair.logRatio;
  }
  const spread = pairs.length * sumXX - sumX * sumX;
  return spread > 0 ? (pairs.length * sumXY - sumX * sumY) / spread : 0;
}
