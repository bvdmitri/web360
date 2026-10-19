import { describe, expect, it } from 'vitest';

import {
  fromRotationVector,
  identity,
  multiply,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { microseconds } from '../shared/units/units';
import type { OrientationSample } from './orientation';
import { lockToWorld } from './stabilize';

const ONE_SECOND = 1_000_000;

const aboutZ = (micros: number, angle: number): OrientationSample => ({
  timestamp: microseconds(micros),
  orientation: fromRotationVector([0, 0, angle]),
});
const expectQuatClose = (a: Quaternion, b: Quaternion): void => {
  expect(a.w).toBeCloseTo(b.w, 9);
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};
const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
  expect(a[2]).toBeCloseTo(b[2], 9);
};

describe('lock to world', () => {
  it('holds the stabilized view at the first attitude for a turning camera', () => {
    const quarter = Math.PI / 2;
    const stream = [0, quarter, Math.PI].map((angle, index) => aboutZ(index * ONE_SECOND, angle));

    const stabilized = lockToWorld(stream);

    expect(stabilized).toHaveLength(3);
    for (const [index, { correction }] of stabilized.entries()) {
      const view = multiply(correction, stream[index]!.orientation);
      expectQuatClose(view, stream[0]!.orientation);
    }
  });

  it('leaves the view steady while the camera rotates under it', () => {
    const stream = [0, Math.PI / 3].map((angle, index) => aboutZ(index * ONE_SECOND, angle));
    const [, later] = lockToWorld(stream);
    if (later === undefined) throw new Error('expected a second sample');
    const forward: Vector3 = [1, 0, 0];
    expectVecClose(rotate(multiply(later.correction, stream[1]!.orientation), forward), forward);
  });

  it('keeps the camera clock', () => {
    const stream = [aboutZ(0, 0), aboutZ(ONE_SECOND, 1)];
    expect(lockToWorld(stream).map((sample) => sample.timestamp)).toEqual([0, ONE_SECOND]);
  });

  it('returns nothing for an empty attitude stream', () => {
    expect(lockToWorld([])).toEqual([]);
  });

  it('is the identity correction at the reference sample', () => {
    const [first] = lockToWorld([aboutZ(0, Math.PI / 5)]);
    if (first === undefined) throw new Error('expected a sample');
    expectQuatClose(first.correction, identity());
  });
});
