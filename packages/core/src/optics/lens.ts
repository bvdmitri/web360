import type { LensOptics, Orientation } from '../model/recording';
import {
  conjugate,
  fromRotationVector,
  multiply,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { degreesToRadians } from '../shared/units/units';

/**
 * Where a direction lands on a lens: its pixel, its angle from the optical axis, whether the lens
 * sees it, and how far inside the field of view it is (`margin`, the half field of view minus the
 * angle; zero at the edge, negative outside). The stitch weights the overlap by the margin.
 */
export interface Projected {
  readonly pixel: readonly [number, number];
  readonly angle: number;
  readonly covered: boolean;
  readonly margin: number;
}

/**
 * Projects a camera-frame direction onto a lens's image.
 *
 * @remarks `direction` is a unit vector in the camera frame. It is rotated into the lens frame by the
 * lens pose, then mapped by the equidistant model `r = f · angle` (ADR 0007), where the angle is
 * measured from the optical axis and `f = radius / (fieldOfView / 2)`. `covered` is false when the
 * angle falls outside the field of view, so the stitch does not sample beyond the fisheye circle.
 */
export function project(lens: LensOptics, direction: Vector3): Projected {
  const [x, y, z] = rotate(conjugate(poseOf(lens.orientation)), direction);
  const angle = Math.acos(Math.max(-1, Math.min(1, z)));
  const azimuth = Math.atan2(y, x);
  const r = focalLength(lens) * angle;
  const [cx, cy] = lens.center;
  const half = halfFieldOfView(lens);
  return {
    pixel: [cx + r * Math.cos(azimuth), cy + r * Math.sin(azimuth)],
    angle,
    covered: angle <= half,
    margin: half - angle,
  };
}

/** Recovers the camera-frame unit direction a lens pixel came from (the inverse of {@link project}). */
export function unproject(lens: LensOptics, pixel: readonly [number, number]): Vector3 {
  const [cx, cy] = lens.center;
  const dx = pixel[0] - cx;
  const dy = pixel[1] - cy;
  const angle = Math.hypot(dx, dy) / focalLength(lens);
  const azimuth = Math.atan2(dy, dx);
  const sine = Math.sin(angle);
  const inLens: Vector3 = [sine * Math.cos(azimuth), sine * Math.sin(azimuth), Math.cos(angle)];
  return rotate(poseOf(lens.orientation), inLens);
}

function poseOf(orientation: Orientation): Quaternion {
  const yaw = fromRotationVector([0, 0, degreesToRadians(orientation.yaw)]);
  const pitch = fromRotationVector([0, degreesToRadians(orientation.pitch), 0]);
  const roll = fromRotationVector([degreesToRadians(orientation.roll), 0, 0]);
  return multiply(multiply(yaw, pitch), roll);
}

function focalLength(lens: LensOptics): number {
  return lens.radius / halfFieldOfView(lens);
}

function halfFieldOfView(lens: LensOptics): number {
  return degreesToRadians(lens.fieldOfView) / 2;
}
