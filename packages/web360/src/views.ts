import {
  clampView as clampCoreView,
  degrees,
  seconds,
  VIEW_PRESETS as CORE_PRESETS,
  viewAt as coreViewAt,
  type View as CoreView,
} from '@web360/core';

/**
 * Where a flat picture of a 360 frame looks and how wide its lens is, in degrees.
 *
 * @remarks `pan` turns right, `tilt` looks up and `roll` leans the top of the picture to the right,
 * applied in that order. `fov` is the angle across the picture's longer side, from 30 to 160.
 * `distance`, from 0 to 1, steps the virtual camera back from the sphere's centre: 0 is a flat
 * (rectilinear) lens and 1 a stereographic one, which at a wide `fov` looking down is a tiny
 * planet. Tilt is held to plus or minus 90 and roll to plus or minus 180.
 */
export interface View {
  readonly pan: number;
  readonly tilt: number;
  readonly roll: number;
  readonly fov: number;
  readonly distance: number;
}

/** A view a path passes through, `time` in seconds from the video's start. */
export interface ViewKeyframe {
  readonly time: number;
  readonly view: View;
}

/** A lens: a field of view and a distance, and for the tiny planet a tilt straight down. */
export interface ViewLens {
  readonly fov: number;
  readonly distance: number;
  readonly tilt?: number;
}

/** The name of a lens preset: `linear`, `dewarp`, `ultra`, `mega` or `tinyPlanet`. */
export type ViewPreset = keyof typeof CORE_PRESETS;

/**
 * The lens presets, from a flat lens to a tiny planet, each wider and further back than the last.
 *
 * @remarks Spread one over a view to apply it: `{ ...view, ...VIEW_PRESETS.ultra }`. The tiny
 * planet also looks straight down.
 */
export const VIEW_PRESETS: Readonly<Record<ViewPreset, ViewLens>> = CORE_PRESETS;

/** The view straight ahead through the `linear` lens. */
export const DEFAULT_VIEW: View = { pan: 0, tilt: 0, roll: 0, ...CORE_PRESETS.linear };

/**
 * The view held to its limits, its pan wrapped into `(-180, 180]`. Throws a `RangeError` for a part
 * that is not a finite number.
 */
export function clampView(view: View): View {
  return clampCoreView(toCoreView(view));
}

/**
 * The view a keyframed path shows at `time`, in seconds.
 *
 * @remarks Each part of the view follows a smooth curve through the keyframes that never
 * overshoots between two of them, keeps moving through a keyframe when the path carries on, and
 * eases into the first and out of the last; before the first and after the last the path holds
 * them. The pan turns the short way round. The keyframes may come in any order. An empty path
 * throws a `RangeError`.
 */
export function viewAt(keyframes: readonly ViewKeyframe[], time: number): View {
  return coreViewAt(
    keyframes.map((keyframe) => ({
      time: seconds(keyframe.time),
      view: toCoreView(keyframe.view),
    })),
    seconds(time),
  );
}

/** The view in the core's units, each part checked to be finite. */
export function toCoreView(view: View): CoreView {
  return {
    pan: degrees(view.pan),
    tilt: degrees(view.tilt),
    roll: degrees(view.roll),
    fov: degrees(view.fov),
    distance: finite(view.distance),
  };
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`distance must be finite, got ${value}`);
  return value;
}
