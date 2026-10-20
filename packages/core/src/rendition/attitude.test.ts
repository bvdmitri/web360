import { describe, expect, it } from 'vitest';

import type { CameraRecording, MotionSample } from '../model/recording';
import { conjugate, fromRotationVector, identity, rotate } from '../shared/math/quaternion';
import { microseconds, seconds } from '../shared/units/units';
import { attitudeOf } from './attitude';

const times = Array.from({ length: 400 }, (...[, index]) => microseconds(index * 50_000));
const tilt = fromRotationVector([0.3, 0, 0]);
const bodyUp = rotate(conjugate(tilt), [0, 0, 1]);

const base = {
  model: 'test',
  frameRate: 30,
  frame: { width: 1, height: 1 },
  lenses: [],
  imuToCamera: identity(),
  exposures: [],
  rollingShutter: seconds(0),
  captureClock: microseconds(0),
} as const;

const still = (value: readonly [number, number, number]): MotionSample[] =>
  times.map((timestamp) => ({ timestamp, value }));

describe('the attitude a rendition uses', () => {
  it("integrates the gyro and levels it by the camera's own gravity readings, whatever their size", () => {
    // Unit up readings, which the accelerometer's near-one-g weighting would all but ignore.
    const recording: CameraRecording = {
      ...base,
      angularVelocity: still([0, 0, 0]),
      acceleration: still([0, 0, 30]),
      gravity: still(bodyUp),
    };
    const attitude = attitudeOf(recording);
    expect(attitude).toHaveLength(times.length);
    const levelledUp = rotate(attitude[200]!.orientation, bodyUp);
    expect(levelledUp[2]).toBeCloseTo(1, 3);
  });

  it('follows the gyro from frame to frame when the camera writes its gravity', () => {
    const recording: CameraRecording = {
      ...base,
      angularVelocity: still([0, 0, 1]),
      acceleration: [],
      gravity: still([0, 0, 1]),
    };
    const attitude = attitudeOf(recording);
    const turned = rotate(attitude[20]!.orientation, [1, 0, 0]);
    const start = rotate(attitude[0]!.orientation, [1, 0, 0]);
    // A turn of one radian a second about up, for one second.
    expect(Math.atan2(turned[1], turned[0]) - Math.atan2(start[1], start[0])).toBeCloseTo(1, 2);
  });

  it('levels the gyro by the accelerometer near one g when the camera writes no gravity', () => {
    const recording: CameraRecording = {
      ...base,
      angularVelocity: still([0, 0, 0]),
      acceleration: still([bodyUp[0] * 9.81, bodyUp[1] * 9.81, bodyUp[2] * 9.81]),
    };
    const levelledUp = rotate(attitudeOf(recording)[200]!.orientation, bodyUp);
    expect(levelledUp[2]).toBeCloseTo(1, 3);
  });
});
