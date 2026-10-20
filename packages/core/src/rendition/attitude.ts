import type { CameraRecording } from '../model/recording';
import { levelAttitude, levelOrientation } from '../motion/level';
import type { OrientationSample } from '../motion/orientation';

/**
 * The camera's attitude over a recording, levelled, as a rendition stabilizes against.
 *
 * @remarks A camera that reports its own fused attitude (a GoPro) is trusted for its motion and
 * levelled by its own up readings, each counted alike (ADR 0021); otherwise the gyro is integrated
 * and levelled by the accelerometer near one g (ADR 0016).
 */
export function attitudeOf(recording: CameraRecording): OrientationSample[] {
  const reported = recording.reportedAttitude;
  return reported === undefined
    ? levelOrientation(recording.angularVelocity, recording.acceleration)
    : levelAttitude(reported.attitude, reported.up, { trust: 'every-reading' });
}
