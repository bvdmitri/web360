import type { OrientationSample } from '../motion/orientation';
import {
  followCamera,
  levelHorizon,
  lockToWorld,
  smoothHeading,
  type StabilizationSample,
} from '../motion/stabilize';
import { identity, multiply } from '../shared/math/quaternion';
import { seconds, type Seconds } from '../shared/units/units';

/**
 * How a rendition holds its view: as the camera moved (`off`), fixed in the world (`lock`), level
 * with the heading following the camera (`horizon`), level with the heading smoothed (`smooth`), or
 * following the camera with all of its motion smoothed (`follow`).
 */
export type Stabilization = 'off' | 'lock' | 'horizon' | 'smooth' | 'follow';

/** The view a rendition shows, and the time constant `smooth` and `follow` smooth it with. */
export interface ViewOptions {
  readonly stabilization: Stabilization;
  readonly smoothing?: Seconds;
}

const DEFAULT_SMOOTHING = seconds(1);

/**
 * The stabilized view's orientation in the world, sample by sample along the camera's attitude.
 *
 * @remarks Each stabilization mode's correction (ADR 0006) is composed onto the attitude, so the
 * result is the `view` that `outputToCamera` takes. With stabilization `off` the view is the
 * attitude itself, so the output turns with the camera. `smoothing` is the heading's time constant
 * for `smooth` and `follow`, one second unless given.
 */
export function viewOf(
  attitude: readonly OrientationSample[],
  options: ViewOptions,
): OrientationSample[] {
  return options.stabilization === 'off'
    ? [...attitude]
    : correctionsOf(attitude, options).map((sample, index) => ({
        timestamp: sample.timestamp,
        orientation: multiply(sample.correction, attitude[index]?.orientation ?? identity()),
      }));
}

function correctionsOf(
  attitude: readonly OrientationSample[],
  options: ViewOptions,
): StabilizationSample[] {
  if (options.stabilization === 'lock') return lockToWorld(attitude);
  if (options.stabilization === 'horizon') return levelHorizon(attitude);
  const smoothing = options.smoothing ?? DEFAULT_SMOOTHING;
  return options.stabilization === 'follow'
    ? followCamera(attitude, smoothing)
    : smoothHeading(attitude, smoothing);
}
