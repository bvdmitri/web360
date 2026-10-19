import type { LensOptics } from '../model/recording';
import { project } from '../optics/lens';
import type { Vector3 } from '../shared/math/quaternion';

/**
 * One lens's contribution to an output direction: which lens, where to sample it, how far out on
 * the fisheye that is, and its blend weight.
 *
 * @remarks `reach` is the pixel's distance from the lens centre over the calibration radius: 0 at the
 * centre, 1 at the radius, and above 1 where the lens's coverage extends past it.
 */
export interface LensSample {
  readonly lens: number;
  readonly pixel: readonly [number, number];
  readonly reach: number;
  readonly weight: number;
}

interface Covered {
  readonly lens: number;
  readonly pixel: readonly [number, number];
  readonly reach: number;
  readonly margin: number;
}

/**
 * Chooses the lens or lenses that see a direction and weights the overlap between them.
 *
 * @remarks `direction` is in the camera frame, the frame the lens poses are stated in; a renderer
 * rotates the output direction by the stabilization correction before calling this. Each covered
 * lens contributes, weighted by how far inside its field of view the direction sits (its margin),
 * so the weights sum to one and feather to zero at a lens's edge, handing off smoothly across the
 * seam. A direction no lens covers returns nothing (a hole). Samples come in lens order. Exposure
 * and vignetting are corrected on the lens colours, not here (ADR 0008).
 */
export function stitchSample(lenses: readonly LensOptics[], direction: Vector3): LensSample[] {
  const covered: Covered[] = [];
  for (const [index, lens] of lenses.entries()) {
    const seen = project(lens, direction);
    if (!seen.covered) continue;
    covered.push({ lens: index, pixel: seen.pixel, reach: seen.reach, margin: seen.margin });
  }
  if (covered.length === 0) return [];
  const total = covered.reduce((sum, one) => sum + one.margin, 0);
  return covered.map((one) => ({
    lens: one.lens,
    pixel: one.pixel,
    reach: one.reach,
    weight: total > 0 ? one.margin / total : 1 / covered.length,
  }));
}
