import { describe, expect, it } from 'vitest';

import {
  conjugate,
  fromRotationVector,
  identity,
  multiply,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { microseconds } from '../shared/units/units';
import type { OrientationSample } from './orientation';
import { levelHorizon, lockToWorld } from './stabilize';

const ONE_SECOND = 1_000_000;

const aboutZ = (micros: number, angle: number): OrientationSample => ({
  timestamp: microseconds(micros),
  orientation: fromRotationVector([0, 0, angle]),
});
const at = (micros: number, orientation: Quaternion): OrientationSample => ({
  timestamp: microseconds(micros),
  orientation,
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

describe('level horizon', () => {
  it('leaves an already-level heading untouched', () => {
    const attitude = fromRotationVector([0, 0, Math.PI / 3]);
    const [sample] = levelHorizon([at(0, attitude)]);
    if (sample === undefined) throw new Error('expected a sample');
    expectQuatClose(sample.correction, identity());
    expectQuatClose(multiply(sample.correction, attitude), attitude);
  });

  it('removes a pure tilt, leaving a level view', () => {
    const attitude = fromRotationVector([Math.PI / 4, 0, 0]);
    const [sample] = levelHorizon([at(0, attitude)]);
    if (sample === undefined) throw new Error('expected a sample');
    expectQuatClose(multiply(sample.correction, attitude), identity());
  });

  it('splits any attitude into a vertical heading and a tilt that carries no heading', () => {
    const attitude = fromRotationVector([0.3, -0.2, 0.5]);
    const [sample] = levelHorizon([at(0, attitude)]);
    if (sample === undefined) throw new Error('expected a sample');

    const view = multiply(sample.correction, attitude);
    const tilt = multiply(attitude, conjugate(view));
    expect(view.x).toBeCloseTo(0, 9);
    expect(view.y).toBeCloseTo(0, 9);
    expect(tilt.z).toBeCloseTo(0, 9);
    expectQuatClose(multiply(tilt, view), attitude);
  });

  it('keeps a vertical view level while the camera tilts under it', () => {
    const attitude = multiply(
      fromRotationVector([0, 0, Math.PI / 6]),
      fromRotationVector([0.4, 0, 0]),
    );
    const [sample] = levelHorizon([at(0, attitude)]);
    if (sample === undefined) throw new Error('expected a sample');
    const up = rotate(multiply(sample.correction, attitude), [0, 0, 1]);
    expectVecClose(up, [0, 0, 1]);
  });

  it('keeps the camera clock and returns nothing for an empty stream', () => {
    expect(levelHorizon([]).length).toBe(0);
    const stream = [at(0, identity()), at(ONE_SECOND, fromRotationVector([0.1, 0, 0]))];
    expect(levelHorizon(stream).map((sample) => sample.timestamp)).toEqual([0, ONE_SECOND]);
  });
});
