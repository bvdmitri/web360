import type { LensOptics } from '../model/recording';
import { project, type Projected } from '../optics/lens';
import { rotate, type Quaternion, type Vector3 } from '../shared/math/quaternion';
import { degreesToRadians } from '../shared/units/units';

/**
 * The extra turn a lens's image row was exposed with, relative to the frame's moment.
 *
 * @remarks A rolling-shutter sensor reads its rows out one after another, so a camera turning
 * during readout sees each row from a slightly different attitude. Given a lens index and a pixel (in
 * calibration-canvas pixels), this returns the rotation that takes a camera-frame direction at the
 * frame's moment to the same direction at the moment that pixel's row was read. Which coordinate
 * the rows run along, and in which order, is the sensor's and is left to the caller.
 */
export type Shutter = (lens: number, pixel: readonly [number, number]) => Quaternion;

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
 * lens contributes, weighted by how far inside its field of view the direction sits (its margin,
 * eased in with a smoothstep over the overlap's width), so the weights sum to one and feather to
 * zero at a lens's edge with no kink, handing off smoothly across the seam. A direction no lens covers returns nothing (a hole). Samples come in lens order. Exposure
 * and vignetting are corrected on the lens colours, not here (ADR 0008). With a `shutter`, each lens
 * is sampled where the direction pointed when that lens's row was exposed: projected once at the
 * frame's moment to find the row, then again through that row's turn.
 */
export function stitchSample(
  lenses: readonly LensOptics[],
  direction: Vector3,
  shutter?: Shutter,
): LensSample[] {
  const covered: Covered[] = [];
  for (const [index, lens] of lenses.entries()) {
    const seen = lookThrough(
      lens,
      direction,
      shutter === undefined ? undefined : (pixel): Quaternion => shutter(index, pixel),
    );
    if (!seen.covered) continue;
    covered.push({
      lens: index,
      pixel: seen.pixel,
      reach: seen.reach,
      margin: easedMargin(lens, seen.margin),
    });
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

// The margin eased in over the overlap's width (the coverage beyond a hemisphere), with no kink
// where a lens starts to count: a linear ramp draws a line along a lens's edge wherever the lenses'
// colours differ. Two opposite lenses still share a direction on the seam evenly.
// The smoothstep `t^2 (3 - 2t)`: zero slope at both ends.
const SMOOTHSTEP_RISE = 3;

function easedMargin(lens: LensOptics, margin: number): number {
  const feather = degreesToRadians(lens.coverage) - Math.PI;
  if (!(feather > 0)) return margin;
  const t = Math.min(1, Math.max(0, margin / feather));
  return t * t * (SMOOTHSTEP_RISE - 2 * t);
}

function lookThrough(
  lens: LensOptics,
  direction: Vector3,
  turnAt: ((pixel: readonly [number, number]) => Quaternion) | undefined,
): Projected {
  const atFrame = project(lens, direction);
  return turnAt === undefined ? atFrame : project(lens, rotate(turnAt(atFrame.pixel), direction));
}
