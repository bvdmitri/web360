import { describe, expect, it } from 'vitest';

import type { MotionSample } from '../model/recording';
import {
  conjugate,
  fromRotationVector,
  multiply,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { microseconds } from '../shared/units/units';
import { levelOrientation } from './level';
import type { OrientationSample } from './orientation';

const STEP = 5000; // 200 Hz
const GRAVITY = 9.81;
const UP: Vector3 = [0, 0, 1];

const times = (seconds: number): number[] =>
  Array.from({ length: Math.round((seconds * 1_000_000) / STEP) }, (...[, index]) => index * STEP);
const samples = (at: readonly number[], value: (time: number) => Vector3): MotionSample[] =>
  at.map((time) => ({ timestamp: microseconds(time), value: value(time) }));
const scale = (v: Vector3, k: number): Vector3 => [v[0] * k, v[1] * k, v[2] * k];
// The angle between where the attitude puts the camera's measured up and the world's up.
const tiltAgainst = (q: Quaternion, trueBodyUp: Vector3): number =>
  Math.acos(Math.min(1, rotate(q, trueBodyUp)[2]));
const angleOf = (q: Quaternion): number => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
const stepRotation = (stream: readonly OrientationSample[], index: number): Quaternion =>
  multiply(conjugate(stream[index]!.orientation), stream[index + 1]!.orientation);

// A small deterministic noise source.
const noise = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648 - 0.5;
  };
};

describe('levelling the orientation', () => {
  it('is empty without motion, and plain integration without an accelerometer', () => {
    expect(levelOrientation([], [])).toEqual([]);
    const at = times(1);
    const gyro = samples(at, () => [0, 0, 0.5]);
    const levelled = levelOrientation(gyro, []);
    expect(angleOf(levelled.at(-1)!.orientation)).toBeCloseTo(
      (0.5 * ((at.length - 1) * STEP)) / 1e6,
      4,
    );
  });

  it('levels a camera held tilted from its first sample on', () => {
    const at = times(20);
    const bodyUp = rotate(conjugate(fromRotationVector([0.5, 0, 0])), UP);
    const levelled = levelOrientation(
      samples(at, () => [0, 0, 0]),
      samples(at, () => scale(bodyUp, GRAVITY)),
    );
    expect(tiltAgainst(levelled[0]!.orientation, bodyUp)).toBeLessThan(0.01);
    expect(tiltAgainst(levelled.at(-1)!.orientation, bodyUp)).toBeLessThan(0.01);
  });

  it('removes a gyro drift the accelerometer reveals over time', () => {
    const at = times(60);
    const levelled = levelOrientation(
      samples(at, () => [0.01, 0, 0]),
      samples(at, () => [0, 0, GRAVITY]),
    );
    // Integration alone would lean 0.6 rad by the end.
    for (const index of [0, at.length >> 1, at.length - 1]) {
      expect(tiltAgainst(levelled[index]!.orientation, UP)).toBeLessThan(0.05);
    }
  });

  it('adds no frame-to-frame motion of its own from a noisy accelerometer', () => {
    const at = times(30);
    const jitter = noise(7);
    const rate: Vector3 = [0.3, -0.2, 0.8];
    const gyro = samples(at, () => rate);
    // The camera's true up, as it turns, plus a jumper's worth of noise.
    const accel = samples(at, (time) => {
      const turned = fromRotationVector(scale(rate, time / 1e6));
      const bodyUp = rotate(conjugate(turned), UP);
      return [
        GRAVITY * (bodyUp[0] + 0.6 * jitter()),
        GRAVITY * (bodyUp[1] + 0.6 * jitter()),
        GRAVITY * (bodyUp[2] + 0.3 * jitter()),
      ];
    });
    const levelled = levelOrientation(gyro, accel);
    const expected = angleOf(fromRotationVector(scale(rate, STEP / 1e6)));
    for (let index = 100; index < at.length - 100; index += 97) {
      const step = angleOf(stepRotation(levelled, index));
      expect(Math.abs(step - expected)).toBeLessThan(5e-6);
    }
  });

  it('trusts readings near one g, not a free fall or a hard pull', () => {
    const at = times(30);
    const levelled = levelOrientation(
      samples(at, () => [0, 0, 0]),
      samples(at, (time) => {
        // Ten seconds of misleading readings, all far from one g.
        if (time > 10e6 && time < 20e6) return time < 15e6 ? [1, 0, 0.2] : [35, 0, 5];
        return [0, 0, GRAVITY];
      }),
    );
    expect(tiltAgainst(levelled[Math.round(15e6 / STEP)]!.orientation, UP)).toBeLessThan(0.02);
  });

  it('leaves the heading to the gyro', () => {
    const at = times(2);
    const levelled = levelOrientation(
      samples(at, () => [0, 0, 1]),
      samples(at, () => [0, 0, GRAVITY]),
    );
    const last = levelled.at(-1)!.orientation;
    expect(2 * Math.atan2(last.z, last.w)).toBeCloseTo(((at.length - 1) * STEP) / 1e6, 4);
    expect(tiltAgainst(last, UP)).toBeLessThan(1e-6);
  });

  it('falls back to plain integration when the timestamps span far more than the samples could', () => {
    const gyro = samples([0, STEP, 1e15], () => [0, 0, 0]);
    const levelled = levelOrientation(
      gyro,
      samples([0, 1e15], () => [GRAVITY, 0, 0]),
    );
    expect(levelled.map((sample) => sample.orientation.w)).toEqual([1, 1, 1]);
  });
});
