import type { LensOptics } from '../model/recording';
import { project } from '../optics/lens';
import type { Vector3 } from '../shared/math/quaternion';

/** One lens's contribution to an output direction: which lens, where to sample it, and its blend weight. */
export interface LensSample {
  readonly lens: number;
  readonly pixel: readonly [number, number];
  readonly weight: number;
}

interface Covered {
  readonly lens: number;
  readonly pixel: readonly [number, number];
  readonly margin: number;
}

/**
 * Chooses the lens or lenses that see a direction and weights the overlap between them.
 *
 * @remarks `direction` is in the camera frame, the frame the lens poses are stated in; a renderer
 * rotates the output direction by the stabilization correction before calling this. Each covered
 * lens contributes, weighted by how far inside its field of view the direction sits (its margin),
 * so the weights sum to one and feather to zero at a lens's edge, handing off smoothly across the
 * seam. A direction no lens covers returns nothing (a hole). Exposure matching and multiband
 * blending are later refinements (ADR 0008).
 */
export function stitchSample(lenses: readonly LensOptics[], direction: Vector3): LensSample[] {
  const covered: Covered[] = [];
  for (const [index, lens] of lenses.entries()) {
    const seen = project(lens, direction);
    if (seen.covered) covered.push({ lens: index, pixel: seen.pixel, margin: seen.margin });
  }
  if (covered.length === 0) return [];
  const total = covered.reduce((sum, one) => sum + one.margin, 0);
  return covered.map((one) => ({
    lens: one.lens,
    pixel: one.pixel,
    weight: total > 0 ? one.margin / total : 1 / covered.length,
  }));
}
