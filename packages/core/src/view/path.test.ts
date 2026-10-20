import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { degrees, seconds } from '../shared/units/units';
import { viewAt, type ViewKeyframe } from './path';
import type { View } from './view';

const view = (parts: Partial<Record<keyof View, number>> = {}): View => ({
  pan: degrees(parts.pan ?? 0),
  tilt: degrees(parts.tilt ?? 0),
  roll: degrees(parts.roll ?? 0),
  fov: degrees(parts.fov ?? 90),
  distance: parts.distance ?? 0,
});

const key = (time: number, parts: Partial<Record<keyof View, number>> = {}): ViewKeyframe => ({
  time: seconds(time),
  view: view(parts),
});

const at = (keyframes: readonly ViewKeyframe[], time: number): View =>
  viewAt(keyframes, seconds(time));

const keyframeList = fc
  .uniqueArray(fc.integer({ min: 0, max: 600 }), { minLength: 1, maxLength: 8 })
  .chain((times) =>
    fc.tuple(
      ...times.map((time) =>
        fc.record({
          time: fc.constant(time / 10),
          pan: fc.double({ min: -179, max: 180, noNaN: true }),
          tilt: fc.double({ min: -90, max: 90, noNaN: true }),
          fov: fc.double({ min: 30, max: 160, noNaN: true }),
          distance: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
      ),
    ),
  )
  .map((parts) => parts.map(({ time, ...rest }) => key(time, rest)));

describe('the view along a keyframed path', () => {
  it('refuses an empty path', () => {
    expect(() => at([], 0)).toThrow(RangeError);
  });

  it('holds the only keyframe everywhere', () => {
    const only = key(2, { pan: 40, fov: 120 });
    expect(at([only], 0)).toEqual(only.view);
    expect(at([only], 9)).toEqual(only.view);
  });

  it('holds the first keyframe before it and the last after it', () => {
    const path = [key(1, { pan: 10 }), key(3, { pan: 50 })];
    expect(at(path, 0).pan).toBeCloseTo(10, 9);
    expect(at(path, 5).pan).toBeCloseTo(50, 9);
  });

  it('passes through every keyframe, in any order given', () => {
    fc.assert(
      fc.property(keyframeList, (keyframes) => {
        const shuffled = keyframes.toReversed();
        for (const keyframe of keyframes) {
          const seen = viewAt(shuffled, keyframe.time);
          expect(seen.tilt).toBeCloseTo(keyframe.view.tilt, 6);
          expect(seen.fov).toBeCloseTo(keyframe.view.fov, 6);
          expect(seen.distance).toBeCloseTo(keyframe.view.distance, 6);
          const panGap = Math.abs(((seen.pan - keyframe.view.pan + 540) % 360) - 180);
          expect(panGap).toBeCloseTo(0, 6);
        }
      }),
    );
  });

  it('never leaves the range of the two keyframes it is between', () => {
    fc.assert(
      fc.property(keyframeList, fc.double({ min: 0, max: 1, noNaN: true }), (keyframes, share) => {
        const sorted = keyframes.toSorted((a, b) => a.time - b.time);
        for (const [index, earlier] of sorted.entries()) {
          const later = sorted[index + 1];
          if (later === undefined) continue;
          const seen = viewAt(sorted, seconds(earlier.time + share * (later.time - earlier.time)));
          for (const part of ['tilt', 'fov', 'distance'] as const) {
            const low = Math.min(earlier.view[part], later.view[part]);
            const high = Math.max(earlier.view[part], later.view[part]);
            expect(seen[part]).toBeGreaterThanOrEqual(low - 1e-9);
            expect(seen[part]).toBeLessThanOrEqual(high + 1e-9);
          }
        }
      }),
    );
  });

  it('turns the short way round across the back', () => {
    const path = [key(0, { pan: 170 }), key(2, { pan: -170 })];
    expect(Math.abs(at(path, 1).pan)).toBeCloseTo(180, 6);
  });

  it('eases in and out instead of starting and stopping with a jolt', () => {
    const path = [key(0, { tilt: 0 }), key(4, { tilt: 40 })];
    const early = at(path, 0.4).tilt;
    const middle = at(path, 2).tilt;
    expect(early).toBeLessThan(4);
    expect(middle).toBeCloseTo(20, 6);
  });

  it('moves through a keyframe without stopping when the path keeps going', () => {
    const path = [key(0, { pan: 0 }), key(2, { pan: 20 }), key(4, { pan: 40 })];
    const before = at(path, 1.9).pan;
    const after = at(path, 2.1).pan;
    // At the keyframe the pan turns at the 10 degrees a second the path averages there.
    expect(after - before).toBeGreaterThan(1.8);
    expect(after - before).toBeLessThan(2.2);
  });

  it('changes continuously over time', () => {
    fc.assert(
      fc.property(keyframeList, fc.double({ min: 0, max: 60, noNaN: true }), (keyframes, time) => {
        const step = 1e-4;
        const here = viewAt(keyframes, seconds(time));
        const next = viewAt(keyframes, seconds(time + step));
        expect(Math.abs(next.tilt - here.tilt)).toBeLessThan(1);
        expect(Math.abs(next.fov - here.fov)).toBeLessThan(1);
      }),
    );
  });
});
