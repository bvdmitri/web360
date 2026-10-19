import type { MotionSample } from '../model/recording';
import {
  conjugate,
  fromRotationVector,
  identity,
  multiply,
  normalize,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import type { OrientationSample } from './orientation';

const MICROS_PER_SECOND = 1_000_000;
const PROPORTIONAL_GAIN = 1;
const INTEGRAL_GAIN = 0.2;
const WORLD_UP: Vector3 = [0, 0, 1];
const ZERO: Vector3 = [0, 0, 0];

interface FusionState {
  readonly attitude: Quaternion;
  readonly integralError: Vector3;
}

interface Step {
  readonly gyro: Vector3;
  readonly gravity: Vector3;
  readonly dt: number;
}

/**
 * Fuses the gyro and accelerometer streams into a drift-corrected attitude per gyro sample.
 *
 * @remarks The gyro stream is integrated (ADR 0004); each step is nudged so the attitude's
 * estimated gravity direction tracks the accelerometer's, by a PI feedback on the cross-product
 * error. The gains are small, so a skydive's transient linear accelerations are rejected and the
 * vertical stays honest over the whole recording. Each gyro sample uses the most recent
 * accelerometer sample at or before its time, so a faster gyro clock is handled; with no
 * accelerometer the result is plain integration. Heading about the vertical is not corrected, as
 * gravity does not constrain it. See ADR 0005.
 *
 * @see {@link OrientationSample}
 */
export function fuseOrientation(
  angularVelocity: readonly MotionSample[],
  acceleration: readonly MotionSample[],
): OrientationSample[] {
  const out: OrientationSample[] = [];
  let state: FusionState = { attitude: identity(), integralError: ZERO };
  let previous: MotionSample | undefined;
  let cursor = 0;
  for (const sample of angularVelocity) {
    cursor = advance(acceleration, cursor, sample.timestamp);
    if (previous !== undefined) {
      const dt = (sample.timestamp - previous.timestamp) / MICROS_PER_SECOND;
      state = fuseStep(state, { gyro: sample.value, gravity: gravityAt(acceleration, cursor), dt });
    }
    out.push({ timestamp: sample.timestamp, orientation: state.attitude });
    previous = sample;
  }
  return out;
}

function fuseStep(state: FusionState, step: Step): FusionState {
  const estimated = rotate(conjugate(state.attitude), WORLD_UP);
  const error = cross(normalize3(step.gravity), estimated);
  const integralError = add3(state.integralError, scale3(error, INTEGRAL_GAIN * step.dt));
  const proportional = scale3(error, PROPORTIONAL_GAIN);
  const corrected = add3(step.gyro, add3(proportional, integralError));
  const rotation = fromRotationVector(scale3(corrected, step.dt));
  return { attitude: normalize(multiply(state.attitude, rotation)), integralError };
}

function advance(accel: readonly MotionSample[], from: number, time: number): number {
  let cursor = from;
  let candidate = accel[cursor + 1];
  while (candidate !== undefined && candidate.timestamp <= time) {
    cursor += 1;
    candidate = accel[cursor + 1];
  }
  return cursor;
}

function gravityAt(accel: readonly MotionSample[], cursor: number): Vector3 {
  const sample = accel[cursor];
  return sample === undefined ? ZERO : sample.value;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function add3(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(v: Vector3, factor: number): Vector3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

function normalize3(v: Vector3): Vector3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length === 0 ? ZERO : [v[0] / length, v[1] / length, v[2] / length];
}
