import {
  conjugate,
  identity,
  multiply,
  normalize,
  slerp,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import type { Microseconds, Seconds } from '../shared/units/units';
import type { OrientationSample } from './orientation';

const WORLD_UP: Vector3 = [0, 0, 1];
const MICROS_PER_SECOND = 1_000_000;

/**
 * A stabilization correction at one instant.
 *
 * @remarks `correction` is the rotation to apply to the camera's attitude to reach the stabilized
 * view: the view a renderer shows is `correction ⊗ cameraAttitude`. A renderer rotates the sphere
 * by it to undo the camera's motion. It is on the same clock as the attitude it was built from.
 */
export interface StabilizationSample {
  readonly timestamp: Microseconds;
  readonly correction: Quaternion;
}

/**
 * Locks the view to a fixed world frame, cancelling all of the camera's rotation.
 *
 * @remarks The stabilized view holds the orientation the camera had at the first sample: every
 * correction maps that sample's attitude back onto itself, so a tumbling camera shows a scene that
 * stays still. This is the default stabilization: it keeps the whole sphere fixed in the world,
 * including heading. Holding only the horizon, or letting heading follow slowly, are other modes.
 */
export function lockToWorld(orientation: readonly OrientationSample[]): StabilizationSample[] {
  const reference = orientation[0]?.orientation ?? identity();
  return orientation.map((sample) => ({
    timestamp: sample.timestamp,
    correction: multiply(reference, conjugate(sample.orientation)),
  }));
}

/**
 * Levels the horizon while letting the heading follow the camera.
 *
 * @remarks The attitude is split about the world vertical into a heading (the rotation about the
 * vertical) and a tilt (the rest), and the correction removes the tilt and keeps the heading. The
 * stabilized view is then a pure rotation about the vertical, so the horizon stays flat while a
 * pan still pans. A camera pointed straight up or down has no defined heading there; the split
 * falls back to no heading rather than failing.
 */
export function levelHorizon(orientation: readonly OrientationSample[]): StabilizationSample[] {
  return orientation.map((sample) => ({
    timestamp: sample.timestamp,
    correction: multiply(headingAbout(sample.orientation, WORLD_UP), conjugate(sample.orientation)),
  }));
}

/**
 * Levels the horizon and lets the heading follow a low-pass of the camera's heading.
 *
 * @remarks Like {@link levelHorizon}, the stabilized view is a pure rotation about the vertical, so
 * the horizon stays flat. Its heading does not follow the camera exactly but an exponential
 * smoothing of it (a slerp toward each sample's heading, per-step weight `1 - exp(-dt /
 * timeConstant)`), so a slow deliberate pan comes through while jitter does not. A larger
 * `timeConstant` smooths harder, toward a locked heading; a very small one follows the heading
 * exactly, as {@link levelHorizon} does. The time constant is the tuning surface, not a contract.
 */
export function smoothHeading(
  orientation: readonly OrientationSample[],
  timeConstant: Seconds,
): StabilizationSample[] {
  const out: StabilizationSample[] = [];
  let smoothed = identity();
  let previous: Microseconds | undefined;
  for (const sample of orientation) {
    const heading = headingAbout(sample.orientation, WORLD_UP);
    smoothed =
      previous === undefined
        ? heading
        : slerp(smoothed, heading, weight(previous, sample.timestamp, timeConstant));
    out.push({
      timestamp: sample.timestamp,
      correction: multiply(smoothed, conjugate(sample.orientation)),
    });
    previous = sample.timestamp;
  }
  return out;
}

function weight(previous: Microseconds, now: Microseconds, timeConstant: Seconds): number {
  const dt = (now - previous) / MICROS_PER_SECOND;
  return 1 - Math.exp(-dt / timeConstant);
}

function headingAbout(q: Quaternion, axis: Vector3): Quaternion {
  const projection = q.x * axis[0] + q.y * axis[1] + q.z * axis[2];
  return normalize({
    w: q.w,
    x: axis[0] * projection,
    y: axis[1] * projection,
    z: axis[2] * projection,
  });
}
