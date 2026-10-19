import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { unproject } from '../optics/lens';
import type { Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import type { LensSampler, Rgb } from './render';
import { seamCorrelation } from './seam';

const lens = (fovDegrees: number, roll: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(fovDegrees),
  coverage: degrees(fovDegrees),
  center: [1000, 1000],
  orientation: { yaw: degrees(3), pitch: degrees(-2), roll: degrees(roll) },
});

const band = { width: 180, height: 12, halfAngle: (3 * Math.PI) / 180 };
const TRUE_FOV = 196;

// A scene at infinity with structure in both longitude and latitude, so a mis-registered seam
// samples different parts of it in the two lenses.
const world = (direction: Vector3): number => {
  const longitude = Math.atan2(direction[1], direction[0]);
  const latitude = Math.asin(direction[2]);
  return 1.6 + Math.sin(7 * longitude) * Math.cos(25 * latitude) + 0.4 * Math.sin(40 * latitude);
};

// What a lens with the given true optics records: the world seen along each pixel's direction.
const camera =
  (truth: LensOptics, exposure: number): LensSampler =>
  (pixel) => {
    const value = exposure * world(unproject(truth, pixel));
    return [value, value, value];
  };

const truthPair = [lens(TRUE_FOV, 0), lens(TRUE_FOV, 180)];
const samplers = [camera(truthPair[0]!, 0.7), camera(truthPair[1]!, 0.3)];

const constant =
  (colour: Rgb): LensSampler =>
  () =>
    colour;

describe('seam correlation', () => {
  it('is near one when the optics match the cameras, whatever each exposes', () => {
    expect(seamCorrelation(truthPair, samplers, band)).toBeGreaterThan(0.999);
  });

  it('drops when the field of view is wrong', () => {
    const correct = seamCorrelation(truthPair, samplers, band);
    for (const wrong of [186, 190, 202, 206]) {
      const guess = [lens(wrong, 0), lens(wrong, 180)];
      expect(seamCorrelation(guess, samplers, band)).toBeLessThan(correct);
    }
  });

  it('does not reward losing part of the band from coverage', () => {
    const full = seamCorrelation(truthPair, samplers, band);
    const narrowed = truthPair.map((optics) => ({ ...optics, coverage: degrees(182) }));
    expect(seamCorrelation(narrowed, samplers, band)).toBeLessThan(0.75 * full);
  });

  it('is zero when there is nothing to correlate', () => {
    expect(seamCorrelation([lens(60, 0)], [constant([0.5, 0.5, 0.5])], band)).toBe(0);
    const flat = [constant([0.5, 0.5, 0.5]), constant([0.2, 0.2, 0.2])];
    expect(seamCorrelation(truthPair, flat, band)).toBe(0);
    const dark = [constant([0, 0, 0]), constant([0.2, 0.2, 0.2])];
    expect(seamCorrelation(truthPair, dark, band)).toBe(0);
  });
});
