import { describe, expect, it } from 'vitest';

import {
  fromRotationVector,
  identity,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { microseconds } from '../shared/units/units';
import { rotationAt } from './interpolate';
import type { OrientationSample } from './orientation';

const aboutZ = (micros: number, angle: number): OrientationSample => ({
  timestamp: microseconds(micros),
  orientation: fromRotationVector([0, 0, angle]),
});
const orientationOf = (sample: OrientationSample): Quaternion => sample.orientation;
const expectSameRotation = (a: Quaternion, b: Quaternion): void => {
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
  ] as const satisfies readonly Vector3[]) {
    const [ax, ay, az] = rotate(a, axis);
    const [bx, by, bz] = rotate(b, axis);
    expect(ax).toBeCloseTo(bx, 9);
    expect(ay).toBeCloseTo(by, 9);
    expect(az).toBeCloseTo(bz, 9);
  }
};

const stream = [aboutZ(0, 0), aboutZ(1000, 0.4), aboutZ(3000, 1.2)];

describe('rotation at a time', () => {
  it('interpolates between the bracketing samples at a constant rate', () => {
    expectSameRotation(rotationAt(stream, 500, orientationOf), fromRotationVector([0, 0, 0.2]));
    expectSameRotation(rotationAt(stream, 2000, orientationOf), fromRotationVector([0, 0, 0.8]));
  });

  it('returns a sample exactly at its own time', () => {
    expectSameRotation(rotationAt(stream, 1000, orientationOf), fromRotationVector([0, 0, 0.4]));
  });

  it('holds the first and last samples outside the stream', () => {
    expectSameRotation(rotationAt(stream, -50, orientationOf), identity());
    expectSameRotation(rotationAt(stream, 9000, orientationOf), fromRotationVector([0, 0, 1.2]));
  });

  it('is the identity for an empty stream', () => {
    expect(rotationAt([], 10, orientationOf)).toEqual(identity());
  });
});
