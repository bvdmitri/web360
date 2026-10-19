import { describe, expect, it } from 'vitest';

import type { MotionSample } from '../model/recording';
import {
  conjugate,
  identity,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { microseconds } from '../shared/units/units';
import { fuseOrientation } from './fusion';

const CENTISECOND = 10_000;
const ONE_SECOND = 1_000_000;
const UP: Vector3 = [0, 0, 1];

const streamOf = (count: number, step: number, value: Vector3): MotionSample[] => {
  const out: MotionSample[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push({ timestamp: microseconds(index * step), value });
  }
  return out;
};
const estimatedGravity = (q: Quaternion): Vector3 => rotate(conjugate(q), UP);
const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tiltFromLevel = (q: Quaternion): number => {
  const alignment = dot(estimatedGravity(q), UP);
  return Math.acos(Math.min(1, alignment));
};
const last = (stream: readonly { orientation: Quaternion }[]): Quaternion =>
  stream.at(-1)!.orientation;
const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
  expect(a[2]).toBeCloseTo(b[2], 6);
};

describe('fuse orientation', () => {
  it('stays level while upright and still', () => {
    const fused = fuseOrientation(
      streamOf(100, CENTISECOND, [0, 0, 0]),
      streamOf(100, CENTISECOND, UP),
    );
    for (const { orientation } of fused) expect(orientation).toEqual(identity());
  });

  it('converges the vertical onto a tilted gravity reading', () => {
    const tilt = 0.4;
    const measured: Vector3 = [Math.sin(tilt), 0, Math.cos(tilt)];
    const fused = fuseOrientation(
      streamOf(2000, CENTISECOND, [0, 0, 0]),
      streamOf(2000, CENTISECOND, measured),
    );
    const gravity = estimatedGravity(last(fused));
    expect(dot(gravity, measured)).toBeGreaterThan(0.999);
  });

  it('rejects a constant gyro bias that plain integration lets drift', () => {
    const bias: Vector3 = [0.3, 0, 0];
    const gyro = streamOf(3000, CENTISECOND, bias);
    const fused = fuseOrientation(gyro, streamOf(3000, CENTISECOND, UP));
    expect(tiltFromLevel(last(fused))).toBeLessThan(0.1);
  });

  it('aligns a faster gyro clock to the most recent accelerometer sample', () => {
    const gyro = streamOf(200, CENTISECOND, [0, 0, 0]);
    const accel = streamOf(100, 2 * CENTISECOND, UP);
    const fused = fuseOrientation(gyro, accel);
    expect(fused).toHaveLength(200);
    expect(last(fused)).toEqual(identity());
  });

  it('integrates plainly when there is no accelerometer', () => {
    const rate: Vector3 = [0, 0, Math.PI / 2];
    const gyro = [0, 1, 2, 3].map((index) => ({
      timestamp: microseconds(index * ONE_SECOND),
      value: rate,
    }));
    const fused = fuseOrientation(gyro, []);
    const turned = (3 * Math.PI) / 2;
    expectVecClose(rotate(last(fused), [1, 0, 0]), [Math.cos(turned), Math.sin(turned), 0]);
  });
});
