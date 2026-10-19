import { conjugate, identity, multiply, type Quaternion } from '../shared/math/quaternion';
import type { Microseconds } from '../shared/units/units';
import type { OrientationSample } from './orientation';

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
