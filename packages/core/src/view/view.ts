import { fromRotationVector, multiply, type Quaternion } from '../shared/math/quaternion';
import { degrees, degreesToRadians, type Degrees } from '../shared/units/units';

/**
 * Where a flat picture of a 360 frame looks and how wide its lens is.
 *
 * @remarks `pan` turns the view right about the vertical, `tilt` raises it above the horizon and
 * `roll` leans the top of the picture to the right, applied in that order (pan, then tilt about the
 * panned right, then roll about the view's own axis). `fov` is the angle across the picture's
 * longer side, seen from the virtual camera. `distance`, from 0 to 1, moves that camera back from
 * the sphere's centre: 0 is a rectilinear lens, 1 sits it on the sphere's surface, a stereographic
 * lens that shows nearly the whole sphere at a wide `fov` (a tiny planet when looking down). ADR
 * 0024 describes the projection.
 */
export interface View {
  readonly pan: Degrees;
  readonly tilt: Degrees;
  readonly roll: Degrees;
  readonly fov: Degrees;
  readonly distance: number;
}

const QUARTER_TURN = 90;
const HALF_TURN = 180;
const FULL_TURN = 360;
const NARROWEST = 30;
const WIDEST = 160;

/** The range each part of a {@link View} is held to; the pan wraps instead (`clampView`). */
export const VIEW_LIMITS = {
  tilt: { min: degrees(-QUARTER_TURN), max: degrees(QUARTER_TURN) },
  roll: { min: degrees(-HALF_TURN), max: degrees(HALF_TURN) },
  fov: { min: degrees(NARROWEST), max: degrees(WIDEST) },
  distance: { min: 0, max: 1 },
} as const;

/** The lens of a {@link View}: its field of view and distance, and a preset's own tilt. */
export type ViewLens = Pick<View, 'fov' | 'distance'> & Partial<Pick<View, 'tilt'>>;

// Each preset's field of view in degrees and distance, as 360 editors' lenses of the name look.
const LENS_FOV = { linear: 80, dewarp: 100, ultra: 115, mega: 130, tinyPlanet: 150 } as const;
const LENS_DISTANCE = { linear: 0, dewarp: 0.25, ultra: 0.55, mega: 0.8 } as const;

function lens(fov: number, distance: number): ViewLens {
  return { fov: degrees(fov), distance };
}

/**
 * The named lenses, from a flat one to a tiny planet, each wider and further back than the last.
 *
 * @remarks They follow the names 360 editors give their lenses: `linear` has no fisheye at all,
 * `dewarp`, `ultra` and `mega` widen it, and `tinyPlanet` also looks straight down. Applying one
 * keeps the view's pan and roll (and its tilt, except for the tiny planet).
 */
export const VIEW_PRESETS = {
  linear: lens(LENS_FOV.linear, LENS_DISTANCE.linear),
  dewarp: lens(LENS_FOV.dewarp, LENS_DISTANCE.dewarp),
  ultra: lens(LENS_FOV.ultra, LENS_DISTANCE.ultra),
  mega: lens(LENS_FOV.mega, LENS_DISTANCE.mega),
  tinyPlanet: { ...lens(LENS_FOV.tinyPlanet, 1), tilt: degrees(-QUARTER_TURN) },
} as const satisfies Record<string, ViewLens>;

/** The name of one of the {@link VIEW_PRESETS}. */
export type ViewPreset = keyof typeof VIEW_PRESETS;

/**
 * The view held to {@link VIEW_LIMITS}, its pan wrapped into `(-180, 180]`.
 *
 * @remarks Every view that reaches a renderer or a keyframe passes through here, so a drag past the
 * zenith or a typed value out of range shows the nearest view that exists.
 */
export function clampView(view: View): View {
  return {
    pan: wrapPan(view.pan),
    tilt: clamp(view.tilt, VIEW_LIMITS.tilt),
    roll: clamp(view.roll, VIEW_LIMITS.roll),
    fov: clamp(view.fov, VIEW_LIMITS.fov),
    distance: clamp(view.distance, VIEW_LIMITS.distance),
  };
}

/**
 * The rotation that takes the view's own frame (looking along `+x`, up `+z`, right `-y`, as the
 * equirectangular frame's centre looks) to where the view looks.
 */
export function viewRotation(view: View): Quaternion {
  const pan = fromRotationVector([0, 0, -degreesToRadians(view.pan)]);
  const tilt = fromRotationVector([0, -degreesToRadians(view.tilt), 0]);
  const roll = fromRotationVector([degreesToRadians(view.roll), 0, 0]);
  return multiply(multiply(pan, tilt), roll);
}

function wrapPan(pan: Degrees): Degrees {
  const turned = (((pan + HALF_TURN) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return degrees(turned === 0 ? HALF_TURN : turned - HALF_TURN);
}

function clamp<T extends number>(value: T, range: { readonly min: T; readonly max: T }): T {
  if (value < range.min) return range.min;
  return value > range.max ? range.max : value;
}
