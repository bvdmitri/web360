import type { OrientationSample } from '../motion/orientation';
import { rotationAt } from '../motion/interpolate';
import { outputToCamera } from '../motion/view';
import type { OpenedRecording } from '../model/video';
import type { StitchFrame } from '../stitch/pack';
import type { Rgb } from '../stitch/render';
import type { SeamColour } from '../stitch/seamColour';
import { rollingShutter } from '../stitch/rollingShutter';
import type { Microseconds } from '../shared/units/units';

const HALVES = 4;

/**
 * What every frame of a rendition shares: the recording, the camera's attitude and the stabilized
 * view on the motion clock, the output width, how finely the shutter is tabulated, and the colour
 * corrections, if any.
 */
export interface RenditionContext {
  readonly opened: OpenedRecording;
  readonly attitude: readonly OrientationSample[];
  readonly view: readonly OrientationSample[];
  readonly width: number;
  readonly shutterSteps: number;
  readonly gains?: readonly Rgb[];
  readonly seam?: SeamColour;
}

/**
 * The stitch of the frame shown at `time` on the video's media clock.
 *
 * @remarks The frame's moment on the motion clock is the capture clock plus `time` (ADR 0010). The
 * output is rotated by the view at that moment into the lens frame (`outputToCamera`), each row is
 * corrected for the turn made during readout (ADR 0011) with the readout down the canvas rows, and
 * the colour corrections are carried as given. The output is twice as wide as it is tall, the height
 * rounded to an even number of rows as encoders expect.
 */
export function frameAt(context: RenditionContext, time: Microseconds): StitchFrame {
  const { recording, canvas, images } = context.opened;
  const frameTime = recording.captureClock + time;
  const attitude = rotationAt(context.attitude, frameTime, (sample) => sample.orientation);
  const view = rotationAt(context.view, frameTime, (sample) => sample.orientation);
  const shutter = rollingShutter({
    attitude: context.attitude,
    imuToCamera: recording.imuToCamera,
    frameTime,
    readout: recording.rollingShutter,
    rows: canvas[1],
  });
  return {
    lenses: recording.lenses.map((optics, index) => ({
      optics,
      image: images[index] ?? { texture: 0, origin: [0, 0], extent: canvas },
    })),
    correction: outputToCamera(recording.imuToCamera, attitude, view),
    width: context.width,
    height: 2 * Math.round(context.width / HALVES),
    shutter: { sample: shutter, rows: canvas[1], steps: context.shutterSteps },
    ...(context.gains !== undefined && { gains: context.gains }),
    ...(context.seam !== undefined && { seam: context.seam }),
  };
}
