import type { MotionSample } from '../model/recording';
import {
  fromRotationVector,
  identity,
  multiply,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { seconds, type Microseconds, type Seconds } from '../shared/units/units';
import { rotationAt } from './interpolate';
import { integrateOrientation, type OrientationSample } from './orientation';

const MICROS_PER_SECOND = 1_000_000;
// The vertical is averaged in tenth-of-a-second bins, over four seconds either way by default.
const BIN_SECONDS = 0.1;
const BIN = (BIN_SECONDS * MICROS_PER_SECOND) as Microseconds;
const WINDOW_SECONDS = 4;
const DEFAULT_WINDOW = seconds(WINDOW_SECONDS);
const STANDARD_GRAVITY = 9.81;
const TRUST = 0.2;
const REACH = 3;
const UP: Vector3 = [0, 0, 1];

/** How slowly the vertical is allowed to move: the Gaussian width it is averaged over. */
export interface LevelOptions {
  readonly window?: Seconds;
}

/**
 * The camera's attitude from its gyro, levelled by the accelerometer averaged over seconds.
 *
 * @remarks The gyro stream is integrated (ADR 0004) and keeps every bit of its frame-to-frame
 * motion; the accelerometer only decides, slowly, which way is up. Each accelerometer reading is
 * turned into the integrated frame and weighted by how close its magnitude is to one g (a jumper
 * leaving the plane, or pulling hard, reads far from it and barely counts), the readings are
 * averaged with a Gaussian of `window` (four seconds unless given) both ways in time, and the
 * attitude is turned by the smallest tilt that takes that averaged up to the world's. The tilt moves
 * at the speed of the gyro's drift, so it adds nothing a viewer sees from frame to frame, unlike a
 * filter that follows the accelerometer as it goes. Heading is the gyro's. Without an
 * accelerometer the result is plain integration. It needs the whole recording, which a rendition
 * has. See ADR 0016.
 */
export function levelOrientation(
  angularVelocity: readonly MotionSample[],
  acceleration: readonly MotionSample[],
  options: LevelOptions = {},
): OrientationSample[] {
  const integrated = integrateOrientation(angularVelocity);
  const first = integrated[0];
  const last = integrated.at(-1);
  if (first === undefined || last === undefined || acceleration.length === 0) return integrated;
  const bins = upBins(integrated, acceleration, { start: first.timestamp, end: last.timestamp });
  const smoothed = smooth(bins, ((options.window ?? DEFAULT_WINDOW) * MICROS_PER_SECOND) / BIN);
  const tilts = smoothed.map((up, index) => ({
    timestamp: (first.timestamp + (index + 1 / 2) * BIN) as Microseconds,
    orientation: tiltToLevel(up),
  }));
  return integrated.map((sample) => ({
    timestamp: sample.timestamp,
    orientation: multiply(
      rotationAt(tilts, sample.timestamp, (tilt) => tilt.orientation),
      sample.orientation,
    ),
  }));
}

function upBins(
  integrated: readonly OrientationSample[],
  acceleration: readonly MotionSample[],
  span: { readonly start: number; readonly end: number },
): Vector3[] {
  const bins: [number, number, number][] = Array.from(
    { length: Math.floor((span.end - span.start) / BIN) + 1 },
    () => [0, 0, 0],
  );
  for (const sample of acceleration) {
    const bin = bins[Math.floor((sample.timestamp - span.start) / BIN)];
    const magnitude = Math.hypot(...sample.value);
    if (bin === undefined || magnitude === 0) continue;
    const attitude = rotationAt(integrated, sample.timestamp, (one) => one.orientation);
    const up = rotate(attitude, sample.value);
    const weight = trust(magnitude) / magnitude;
    bin[0] += up[0] * weight;
    bin[1] += up[1] * weight;
    bin[2] += up[2] * weight;
  }
  return bins;
}

function trust(magnitude: number): number {
  const deviation = (magnitude - STANDARD_GRAVITY) / (TRUST * STANDARD_GRAVITY);
  return Math.exp(-deviation * deviation);
}

function smooth(bins: readonly Vector3[], sigma: number): Vector3[] {
  const reach = Math.ceil(REACH * sigma);
  const kernel = Array.from({ length: 2 * reach + 1 }, (...[, index]) =>
    Math.exp(-(((index - reach) / sigma) ** 2) / 2),
  );
  return bins.map((...[, centre]) => {
    const sum: [number, number, number] = [0, 0, 0];
    for (const [offset, weight] of kernel.entries()) {
      const bin = bins[centre + offset - reach];
      if (bin === undefined) continue;
      sum[0] += bin[0] * weight;
      sum[1] += bin[1] * weight;
      sum[2] += bin[2] * weight;
    }
    return sum;
  });
}

// The smallest rotation taking `up` (any length) onto the world's up; none when it says nothing.
function tiltToLevel(up: Vector3): Quaternion {
  const length = Math.hypot(...up);
  if (length === 0) return identity();
  const [x, y, z] = up.map((value) => value / length) as unknown as Vector3;
  const angle = Math.acos(Math.max(-1, Math.min(1, z)));
  const axis: Vector3 = [y * UP[2], -x * UP[2], 0];
  const axisLength = Math.hypot(...axis);
  if (axisLength === 0) return identity();
  const unit = angle / axisLength;
  return fromRotationVector([axis[0] * unit, axis[1] * unit, axis[2] * unit]);
}
