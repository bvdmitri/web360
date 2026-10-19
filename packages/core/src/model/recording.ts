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

/** One lens's optics in the calibration canvas: its projection, fisheye radius, centre and pose. */
export interface LensOptics {
  readonly projection: LensProjection;
  readonly radius: number;
  readonly center: readonly [number, number];
  readonly orientation: Orientation;
}

/** One motion sample on the capture clock: angular velocity in rad/s and acceleration in g. */
export interface MotionSample {
  readonly timestamp: Microseconds;
  readonly angularVelocity: readonly [number, number, number];
  readonly acceleration: readonly [number, number, number];
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
 */
export interface CameraRecording {
  readonly model: string;
  readonly frameRate: number;
  readonly frame: Dimensions;
  readonly lenses: readonly LensOptics[];
  readonly motion: readonly MotionSample[];
  readonly exposures: readonly FrameExposure[];
  readonly rollingShutter: Seconds;
  readonly captureClock: Microseconds;
}
