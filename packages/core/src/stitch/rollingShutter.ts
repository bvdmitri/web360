import { rotationAt } from '../motion/interpolate';
import type { OrientationSample } from '../motion/orientation';
import { conjugate, multiply, type Quaternion } from '../shared/math/quaternion';
import type { Seconds } from '../shared/units/units';
import type { Shutter } from './sample';

const MICROS_PER_SECOND = 1_000_000;

/** What a rolling-shutter correction needs for one frame. */
export interface RollingShutterFrame {
  readonly attitude: readonly OrientationSample[];
  readonly imuToCamera: Quaternion;
  readonly frameTime: number;
  readonly readout: Seconds;
  readonly rows: number;
}

/**
 * Builds the {@link Shutter} for one frame from the camera's attitude.
 *
 * @remarks The sensor is read top to bottom, one row after another, over `readout`: the first row
 * (canvas row 0) is read at `frameTime` (microseconds on the motion clock) and the last (`rows`) a
 * readout later, in every lens. A pixel's row time is placed on the attitude stream and the turn
 * the camera made since `frameTime` is expressed in the lens frame (through `imuToCamera`), so the
 * stitch samples each lens where the direction pointed when that row was read. On the ONE R this
 * order and timing were the best of the candidates tried on fast canopy turns, though by a modest
 * margin (ADR 0011).
 */
export function rollingShutter(frame: RollingShutterFrame): Shutter {
  const atFrame = rotationAt(frame.attitude, frame.frameTime, (sample) => sample.orientation);
  const toImu = conjugate(frame.imuToCamera);
  const readout = frame.readout * MICROS_PER_SECOND;
  return (...[, pixel]: Parameters<Shutter>) => {
    const time = frame.frameTime + (pixel[1] / frame.rows) * readout;
    const atRow = rotationAt(frame.attitude, time, (sample) => sample.orientation);
    const turnInImu = multiply(conjugate(atRow), atFrame);
    return multiply(multiply(frame.imuToCamera, turnInImu), toImu);
  };
}
