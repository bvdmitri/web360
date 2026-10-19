import { describe, expect, it } from 'vitest';

import type { OrientationSample } from '../motion/orientation';
import { fromRotationVector, multiply } from '../shared/math/quaternion';
import { microseconds, seconds } from '../shared/units/units';
import { viewOf } from './motion';

const attitude: OrientationSample[] = Array.from({ length: 50 }, (...[, index]) => ({
  timestamp: microseconds(index * 10_000),
  orientation: multiply(
    fromRotationVector([0, 0, index * 0.02]),
    fromRotationVector([0.01 * Math.sin(index), 0, 0]),
  ),
}));

describe('the stabilized view', () => {
  it('follows the camera exactly when stabilization is off', () => {
    expect(viewOf(attitude, { stabilization: 'off' })).toEqual(attitude);
  });

  it('holds the first attitude when locked to the world', () => {
    const view = viewOf(attitude, { stabilization: 'lock' });
    for (const sample of view) {
      expect(sample.orientation.w).toBeCloseTo(attitude[0]!.orientation.w, 9);
      expect(sample.orientation.z).toBeCloseTo(attitude[0]!.orientation.z, 9);
    }
  });

  it('keeps the heading and drops the tilt when levelling the horizon', () => {
    const view = viewOf(attitude, { stabilization: 'horizon' });
    expect(view[10]!.orientation.x).toBeCloseTo(0, 9);
    expect(view[10]!.orientation.z).toBeCloseTo(Math.sin(0.1), 6);
  });

  it('smooths the heading with the given time constant', () => {
    const view = viewOf(attitude, { stabilization: 'smooth', smoothing: seconds(0.001) });
    expect(view[10]!.orientation.z).toBeCloseTo(Math.sin(0.1), 2);
    expect(view.map((sample) => sample.timestamp)).toEqual(
      attitude.map((sample) => sample.timestamp),
    );
  });

  it('is empty without attitude', () => {
    expect(viewOf([], { stabilization: 'smooth' })).toEqual([]);
  });
});
