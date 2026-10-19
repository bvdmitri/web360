import type { LensOptics } from '../model/recording';
import { degrees } from '../shared/units/units';
import type { LensSampler } from './render';
import { seamCorrelation, type Band } from './seam';

const FIELD_OF_VIEW_STEP = 2;
const ANGLE_STEP = 0.5;
const SMALLEST_STEP = 0.005;
const MAX_PASSES = 80;
const MIN_GAIN = 1e-9;
const POSE_AXES = ['yaw', 'pitch', 'roll'] as const;

/** Refined lens optics and the seam correlation they reach. */
export interface Refinement {
  readonly lenses: readonly LensOptics[];
  readonly correlation: number;
}

interface Knob {
  readonly lens: number | 'all';
  readonly adjust: (optics: LensOptics, delta: number) => LensOptics;
  step: number;
}

interface Context {
  readonly samplers: readonly LensSampler[];
  readonly band: Band;
}

/**
 * Refines the lenses' shared mapping and their relative pose so they register best across the seam.
 *
 * @remarks Starting from `lenses`, this adjusts one `fieldOfView` (focal length) shared by every
 * lens, and every lens's pose after the first, by coordinate descent on {@link seamCorrelation} over
 * `band`: each parameter is nudged up and down by its step, a nudge is kept if it raises the
 * correlation, and a step that helps in neither direction is halved, until every step is below a
 * few thousandths of a degree. The mapping is shared because the seam only constrains the lenses'
 * focal lengths together: on a thin band around the seam, one lens a little long and the other a
 * little short register almost as well as both right, so separate focal lengths would drift along
 * that ridge rather than converge. The first lens is the reference pose, as rotating every lens
 * together does not change how they register, and coverage is left alone. Run it on frames where the
 * scene is far from the camera (freefall, open sky); anything close to the lenses has parallax no
 * calibration removes and will pull the result toward a compromise.
 */
export function refineCalibration(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  band: Band,
): Refinement {
  const context: Context = { samplers, band };
  const knobs = knobsFor(lenses.length);
  let best = evaluate(lenses, context);
  for (
    let pass = 0;
    pass < MAX_PASSES && knobs.some((knob) => knob.step > SMALLEST_STEP);
    pass += 1
  ) {
    for (const knob of knobs) best = nudge(best, knob, context);
  }
  return best;
}

function nudge(best: Refinement, knob: Knob, context: Context): Refinement {
  const up = evaluate(adjusted(best.lenses, knob, knob.step), context);
  const down = evaluate(adjusted(best.lenses, knob, -knob.step), context);
  const winner = up.correlation >= down.correlation ? up : down;
  if (winner.correlation > best.correlation + MIN_GAIN) return winner;
  knob.step /= 2;
  return best;
}

function evaluate(lenses: readonly LensOptics[], context: Context): Refinement {
  return { lenses, correlation: seamCorrelation(lenses, context.samplers, context.band) };
}

function adjusted(lenses: readonly LensOptics[], knob: Knob, delta: number): LensOptics[] {
  return lenses.map((optics, index) =>
    knob.lens === 'all' || index === knob.lens ? knob.adjust(optics, delta) : optics,
  );
}

function knobsFor(count: number): Knob[] {
  const knobs: Knob[] = [{ lens: 'all', step: FIELD_OF_VIEW_STEP, adjust: widened }];
  for (let lens = 1; lens < count; lens += 1) knobs.push(...poseKnobs(lens));
  return knobs;
}

function poseKnobs(lens: number): Knob[] {
  return POSE_AXES.map((axis) => ({
    lens,
    step: ANGLE_STEP,
    adjust: (optics: LensOptics, delta: number): LensOptics => ({
      ...optics,
      orientation: { ...optics.orientation, [axis]: degrees(optics.orientation[axis] + delta) },
    }),
  }));
}

function widened(optics: LensOptics, delta: number): LensOptics {
  return { ...optics, fieldOfView: degrees(optics.fieldOfView + delta) };
}
