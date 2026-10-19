import type { Quaternion } from '../shared/math/quaternion';
import type { Degrees, Microseconds, Seconds } from '../shared/units/units';

/** A pixel width and height. */
export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** A lens orientation as yaw, pitch and roll in degrees. */
export interface Orientation {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

/**
 * How a lens maps directions to pixels.
 *
 * @remarks `equidistant` is the v1 fisheye model the ONE R and the older X-series state. More
 * follow (the unified Mei model, and the equiangular cube map GoPro writes), so this is a union
 * that will grow and {@link LensOptics} will generalise with it.
 */
export type LensProjection = 'equidistant';

/**
 * One lens's optics in the calibration canvas: its projection, scale, coverage, centre and pose.
 *
 * @remarks Two angles describe the lens, and they differ. `fieldOfView` is the mapping: the full
 * angle that reaches `radius` pixels from the centre, so the equidistant focal length is
 * `radius / (fieldOfView / 2)`. `coverage` is how much of the sphere the lens is trusted to image:
 * the image usually extends past `radius`, and the overlap between lenses lives in that extension,
 * so `coverage` is normally the larger. Neither is in the v1 calibration; the reader supplies both
 * for the camera model (ADR 0007).
 */
export interface LensOptics {
  readonly projection: LensProjection;
  readonly radius: number;
  readonly fieldOfView: Degrees;
  readonly coverage: Degrees;
  readonly center: readonly [number, number];
  readonly orientation: Orientation;
}

/**
 * Where a lens's image sits in the decoded video: which video's frames hold it, and the rectangle
 * of the calibration canvas those frames cover (`origin` and `extent` in canvas pixels).
 *
 * @remarks A camera that records each lens to its own file has one video per lens, each covering
 * its lens's half of the canvas; one that records both lenses side by side has one video covering
 * the whole canvas, shared by both lenses. A renderer binds video `texture`'s frame and maps a lens
 * pixel into it through the rectangle.
 */
export interface LensImage {
  readonly texture: number;
  readonly origin: readonly [number, number];
  readonly extent: readonly [number, number];
}

/**
 * One motion sample on the capture clock: a timestamped 3-vector.
 *
 * @remarks The {@link CameraRecording} field that holds the sample says what the vector is:
 * `angularVelocity` in rad/s, `acceleration` in m/s^2. A sample carries one sensor's reading at
 * one instant, and the two sensors are separate streams because a camera may log them at different
 * rates: a GoPro records its gyroscope several times faster than its accelerometer, where an
 * Insta360 fuses both into one tick (there the two streams share their timestamps).
 */
export interface MotionSample {
  readonly timestamp: Microseconds;
  readonly value: readonly [number, number, number];
}

/** One frame's capture time and exposure duration. */
export interface FrameExposure {
  readonly timestamp: Microseconds;
  readonly exposure: Seconds;
}

/**
 * A camera's 360 recording as vendor-neutral data: what it is, how its lenses see, how it moved,
 * and how its frames are timed.
 *
 * @remarks Every vendor reader fills this one shape, and every computation over a recording reads
 * it without knowing the vendor. It is telemetry, optics and timing, not pixels: a frame's bytes
 * are decoded through a port at processing time, not held here. `captureClock` is the first
 * frame's timestamp, the origin the motion and exposure timestamps share.
 *
 * `angularVelocity` (rad/s) and `acceleration` (m/s^2) are separate streams on that clock, each at
 * its sensor's own rate, in the IMU's axes. `imuToCamera` turns those axes into the frame the lens
 * poses are stated in; without it the attitude integrated from the motion cannot steer the stitch.
 * A video frame shown at time `t` into the video was captured at `captureClock + t`.
 */
export interface CameraRecording {
  readonly model: string;
  readonly frameRate: number;
  readonly frame: Dimensions;
  readonly lenses: readonly LensOptics[];
  readonly angularVelocity: readonly MotionSample[];
  readonly acceleration: readonly MotionSample[];
  readonly imuToCamera: Quaternion;
  readonly exposures: readonly FrameExposure[];
  readonly rollingShutter: Seconds;
  readonly captureClock: Microseconds;
}
