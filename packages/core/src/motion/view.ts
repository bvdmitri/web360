import { conjugate, multiply, type Quaternion } from '../shared/math/quaternion';

/**
 * The rotation that takes an output (stabilized view) direction into the lens calibration frame.
 *
 * @remarks Three frames meet when a stabilized frame is stitched. `view` is the stabilized view's
 * orientation in the world (a stabilization mode's correction composed onto the attitude, ADR
 * 0006), `attitude` is the camera body's orientation in the world at the same instant (ADR 0004,
 * 0005), and `imuToCamera` turns the IMU's axes into the frame the lens poses are stated in. An
 * output direction goes to the world by `view`, into the body by the inverse of `attitude`, and
 * into the lens frame by `imuToCamera`. The result is the stitch's per-frame rotation
 * (`Scene.correction`).
 */
export function outputToCamera(
  imuToCamera: Quaternion,
  attitude: Quaternion,
  view: Quaternion,
): Quaternion {
  return multiply(multiply(imuToCamera, conjugate(attitude)), view);
}
