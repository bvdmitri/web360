import type { CameraRecording } from '../model/recording';
import { levelOrientation } from '../motion/level';
import type { OrientationSample } from '../motion/orientation';

/**
 * The camera's attitude over a recording, levelled, as a rendition stabilizes against.
 *
 * @remarks The gyro is integrated and levelled (ADR 0016): by the camera's own gravity readings
 * when it writes them, each counted alike since they are unit vectors (a GoPro, ADR 0023), and
 * otherwise by the accelerometer near one g.
 */
export function attitudeOf(recording: CameraRecording): OrientationSample[] {
  const { angularVelocity, acceleration, gravity } = recording;
  return gravity === undefined
    ? levelOrientation(angularVelocity, acceleration)
    : levelOrientation(angularVelocity, gravity, { trust: 'every-reading' });
}
