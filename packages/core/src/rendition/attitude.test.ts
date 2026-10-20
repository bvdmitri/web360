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
  it('levels the camera reported attitude by its own up readings when it reports one', () => {
    const recording: CameraRecording = {
      ...base,
      angularVelocity: still([0, 0, 5]),
      acceleration: [],
      reportedAttitude: {
        attitude: times.map((timestamp) => ({ timestamp, orientation: identity() })),
        up: still(bodyUp),
      },
    };
    const attitude = attitudeOf(recording);
    expect(attitude).toHaveLength(times.length);
    const levelledUp = rotate(attitude[200]!.orientation, bodyUp);
    expect(levelledUp[2]).toBeCloseTo(1, 3);
  });

  it('integrates and levels the gyro when the camera reports no attitude', () => {
    const recording: CameraRecording = {
      ...base,
      angularVelocity: still([0, 0, 0]),
      acceleration: still([bodyUp[0] * 9.81, bodyUp[1] * 9.81, bodyUp[2] * 9.81]),
    };
    const levelledUp = rotate(attitudeOf(recording)[200]!.orientation, bodyUp);
    expect(levelledUp[2]).toBeCloseTo(1, 3);
  });
});
