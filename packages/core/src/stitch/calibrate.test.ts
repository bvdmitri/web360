import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { unproject } from '../optics/lens';
import type { Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { refineCalibration } from './calibrate';
import type { LensSampler } from './render';
import { seamCorrelation } from './seam';

const lens = (fov: number, orientation: [number, number, number]): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(fov),
  coverage: degrees(192),
  center: [1000, 1000],
  orientation: {
    yaw: degrees(orientation[0]),
    pitch: degrees(orientation[1]),
    roll: degrees(orientation[2]),
  },
});

const band = { width: 180, height: 12, halfAngle: (3 * Math.PI) / 180 };

const world = (direction: Vector3): number => {
  const longitude = Math.atan2(direction[1], direction[0]);
  const latitude = Math.asin(direction[2]);
  return 1.6 + Math.sin(7 * longitude) * Math.cos(25 * latitude) + 0.4 * Math.sin(40 * latitude);
};

const camera =
  (truth: LensOptics, exposure: number): LensSampler =>
  (pixel) => {
    const value = exposure * world(unproject(truth, pixel));
    return [value, value, value];
  };

// The true rig: a mapping wider than the guess, and the back lens a little off its nominal flip.
const truth = [lens(184, [0.2, 0.1, 0]), lens(184, [0.7, -0.5, 179.6])];
const samplers = [camera(truth[0]!, 0.7), camera(truth[1]!, 0.35)];

describe('calibration refinement', () => {
  it('recovers the shared mapping and the back lens pose from a mis-guessed start', () => {
    const guess = [lens(183, [0.2, 0.1, 0]), lens(183, [0, 0, 180])];
    const refined = refineCalibration(guess, samplers, band);

    expect(refined.correlation).toBeGreaterThan(0.999);
    expect(refined.correlation).toBeGreaterThan(seamCorrelation(guess, samplers, band));
    const [front, back] = refined.lenses;
    expect(front?.fieldOfView).toBeCloseTo(184, 1);
    expect(back?.fieldOfView).toBeCloseTo(184, 1);
    expect(back?.orientation.yaw).toBeCloseTo(0.7, 1);
    expect(back?.orientation.pitch).toBeCloseTo(-0.5, 1);
    expect(back?.orientation.roll).toBeCloseTo(179.6, 1);
  });

  it('keeps the first lens as the reference pose and leaves coverage alone', () => {
    const guess = [lens(183, [0.2, 0.1, 0]), lens(183, [0, 0, 180])];
    const [front, back] = refineCalibration(guess, samplers, band).lenses;
    expect(front?.orientation).toEqual(guess[0]?.orientation);
    expect(back?.coverage).toBe(guess[1]?.coverage);
  });

  it('returns the start unchanged when nothing improves it', () => {
    const refined = refineCalibration(truth, samplers, band);
    expect(refined.lenses).toEqual(truth);
  });
});
