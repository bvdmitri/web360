import type { MotionSample } from '../model/recording';
import {
  fromRotationVector,
  identity,
  multiply,
  normalize,
  type Quaternion,
} from '../shared/math/quaternion';
import type { Microseconds } from '../shared/units/units';

const MICROS_PER_SECOND = 1_000_000;

/** The camera's attitude at one instant: a unit quaternion from the body frame to the world. */
export interface OrientationSample {
  readonly timestamp: Microseconds;
  readonly orientation: Quaternion;
}

/**
 * Integrates an angular-velocity stream into the camera's attitude over time.
 *
 * @remarks `angularVelocity` is the recording's gyro stream (rad/s, body frame, on the capture
 * clock). The result has one attitude per input sample, on the same timestamps, starting at the
 * identity: orientation is relative to how the camera was held when the stream begins. Each step
 * composes the exponential map of the averaged angular velocity over its time interval onto the
 * running attitude, renormalized so it stays on the unit sphere. See ADR 0004.
 *
 * @see {@link OrientationSample}
 */
export function integrateOrientation(
  angularVelocity: readonly MotionSample[],
): OrientationSample[] {
  const out: OrientationSample[] = [];
  let attitude = identity();
  let previous: MotionSample | undefined;
  for (const sample of angularVelocity) {
    if (previous !== undefined) {
      attitude = normalize(multiply(attitude, step(previous, sample)));
    }
    out.push({ timestamp: sample.timestamp, orientation: attitude });
    previous = sample;
  }
  return out;
}

function step(previous: MotionSample, sample: MotionSample): Quaternion {
  const dt = (sample.timestamp - previous.timestamp) / MICROS_PER_SECOND;
  const [px, py, pz] = previous.value;
  const [x, y, z] = sample.value;
  return fromRotationVector([((px + x) / 2) * dt, ((py + y) / 2) * dt, ((pz + z) / 2) * dt]);
}
