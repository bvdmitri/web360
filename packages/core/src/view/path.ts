import { degrees, type Seconds } from '../shared/units/units';
import { clampView, type View } from './view';

/** A view the path passes through at a time, in seconds from the video's start. */
export interface ViewKeyframe {
  readonly time: Seconds;
  readonly view: View;
}

const FULL_TURN = 360;
const HALF_TURN = 180;
const THREE = 3;

/**
 * The view a keyframed path shows at `time`.
 *
 * @remarks Each part of the view (the pan, tilt, roll, field of view and distance) follows its own
 * monotone cubic curve through the keyframes (ADR 0025): it passes through every keyframe, never
 * overshoots between two of them, keeps moving through a keyframe when the path carries on in the
 * same direction, and eases into the first and out of the last. Before the first keyframe and
 * after the last the path holds them. The pan turns the short way round between two keyframes, so
 * 170 to -170 crosses the back of the sphere. The keyframes may come in any order; two at the same
 * time keep the later one given. An empty path is a `RangeError`.
 */
export function viewAt(keyframes: readonly ViewKeyframe[], time: Seconds): View {
  const sorted = byTime(keyframes);
  if (sorted.length === 0) throw new RangeError('a view path needs at least one keyframe');
  const times = sorted.map((keyframe) => keyframe.time);
  const views = sorted.map((keyframe) => keyframe.view);
  const part = (name: keyof View): number => {
    const values = views.map((view) => view[name]);
    return monotoneCubic({ times, values: name === 'pan' ? unwrapped(values) : values }, time);
  };
  return clampView({
    pan: degrees(part('pan')),
    tilt: degrees(part('tilt')),
    roll: degrees(part('roll')),
    fov: degrees(part('fov')),
    distance: part('distance'),
  });
}

function byTime(keyframes: readonly ViewKeyframe[]): ViewKeyframe[] {
  const latest = new Map<number, ViewKeyframe>();
  for (const keyframe of keyframes) latest.set(keyframe.time, keyframe);
  return [...latest.values()].toSorted((a, b) => a.time - b.time);
}

// Each pan moved by whole turns to within half a turn of the one before it.
function unwrapped(pans: readonly number[]): number[] {
  const result: number[] = [];
  for (const pan of pans) {
    const previous = result.at(-1);
    result.push(previous === undefined ? pan : previous + shortestTurn(pan - previous));
  }
  return result;
}

function shortestTurn(step: number): number {
  return ((((step + HALF_TURN) % FULL_TURN) + FULL_TURN) % FULL_TURN) - HALF_TURN;
}

interface Curve {
  readonly times: readonly number[];
  readonly values: readonly number[];
}

// The entry of a list the caller has checked the length of.
function item(list: readonly number[], index: number): number {
  const value = list[index];
  if (value === undefined) throw new RangeError(`no entry ${index} in a list of ${list.length}`);
  return value;
}

// A Fritsch-Carlson monotone cubic through the points, flat at both ends and held beyond them.
function monotoneCubic(curve: Curve, time: number): number {
  const { times, values } = curve;
  const last = times.length - 1;
  if (time <= item(times, 0)) return item(values, 0);
  if (time >= item(times, last)) return item(values, last);
  const index = times.findIndex((at) => at > time) - 1;
  const t0 = item(times, index);
  const span = item(times, index + 1) - t0;
  const s = (time - t0) / span;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - THREE * s2 + 1) * item(values, index) +
    (s3 - 2 * s2 + s) * span * tangent(curve, index) +
    (THREE * s2 - 2 * s3) * item(values, index + 1) +
    (s3 - s2) * span * tangent(curve, index + 1)
  );
}

function tangent(curve: Curve, index: number): number {
  const { times, values } = curve;
  if (index === 0 || index === times.length - 1) return 0;
  const before = item(times, index) - item(times, index - 1);
  const after = item(times, index + 1) - item(times, index);
  const into = (item(values, index) - item(values, index - 1)) / before;
  const outOf = (item(values, index + 1) - item(values, index)) / after;
  if (into * outOf <= 0) return 0;
  const first = 2 * after + before;
  const second = after + 2 * before;
  return (first + second) / (first / into + second / outOf);
}
