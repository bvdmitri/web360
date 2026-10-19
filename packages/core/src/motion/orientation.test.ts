import { describe, expect, it } from 'vitest';

import type { MotionSample } from '../model/recording';
import { identity, rotate, type Vector3 } from '../shared/math/quaternion';
import { microseconds } from '../shared/units/units';
import { integrateOrientation } from './orientation';

const HALF_SECOND = 500_000;
const ONE_SECOND = 1_000_000;

const sample = (micros: number, value: Vector3): MotionSample => ({
  timestamp: microseconds(micros),
  value,
});
const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
  expect(a[2]).toBeCloseTo(b[2], 9);
};

describe('integrate orientation', () => {
  it('starts at the identity and keeps the timestamps', () => {
    const result = integrateOrientation([sample(0, [0, 0, 1]), sample(ONE_SECOND, [0, 0, 1])]);
    expect(result).toHaveLength(2);
    expect(result[0]?.orientation).toEqual(identity());
    expect(result[0]?.timestamp).toBe(0);
    expect(result[1]?.timestamp).toBe(ONE_SECOND);
  });

  it('accumulates a constant turn about an axis', () => {
    const rate: Vector3 = [0, 0, Math.PI / 2];
    const stream = [0, HALF_SECOND, ONE_SECOND, HALF_SECOND + ONE_SECOND].map((t) =>
      sample(t, rate),
    );

    const result = integrateOrientation(stream);

    const afterThreeSteps = result[3]!.orientation;
    const turned = (3 * Math.PI) / 4;
    expectVecClose(rotate(afterThreeSteps, [1, 0, 0]), [Math.cos(turned), Math.sin(turned), 0]);
  });

  it('stays at the identity while the camera is still', () => {
    const stream = [0, ONE_SECOND, 2 * ONE_SECOND].map((t) => sample(t, [0, 0, 0]));
    for (const { orientation } of integrateOrientation(stream)) {
      expect(orientation).toEqual(identity());
    }
  });

  it('returns nothing for an empty stream', () => {
    expect(integrateOrientation([])).toEqual([]);
  });
});
