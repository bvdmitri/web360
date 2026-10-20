import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { project } from '../optics/lens';
import type { Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import type { LensSampler, Rgb } from './render';
import {
  estimateSeamColour,
  seamPosition,
  seamShift,
  SEAM_BINS,
  type SeamColour,
} from './seamColour';

const lens = (pitch: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(190),
  coverage: degrees(196),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(pitch), roll: degrees(0) },
});
const lenses = [lens(0), lens(180)];

const constant =
  (colour: Rgb): LensSampler =>
  () =>
    colour;

// A sky that the second lens sees with a haze added on the side where the lens-0 azimuth is near 0.
const hazy =
  (haze: number): LensSampler =>
  (pixel) => {
    const azimuth = Math.atan2(pixel[1] - 1000, pixel[0] - 1000);
    const sun = Math.max(0, Math.cos(azimuth));
    return [0.2 + haze * sun, 0.4 + haze * sun, 0.7 + haze * sun];
  };

const expectRgbClose = (a: Rgb, b: Rgb, digits: number): void => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
  expect(a[2]).toBeCloseTo(b[2], digits);
};

const striped: LensSampler = (pixel) => {
  const azimuth = Math.atan2(pixel[1] - 1000, pixel[0] - 1000);
  // A jumper on the seam near azimuth 0: busy, high-contrast content in one lens only.
  const isJumper = Math.abs(azimuth) < 0.15 && Math.floor(pixel[0] / 3) % 2 === 0;
  return isJumper ? [0.9, 0.1, 0.1] : [0.2, 0.4, 0.7];
};

describe('where a direction sits on the seam', () => {
  it('is on the seam, at the lens-0 azimuth, halfway between opposite lenses', () => {
    const position = seamPosition(lenses, [0, 1, 0]);
    expect(position.offset).toBeCloseTo(0, 9);
    expect(Math.abs(position.azimuth)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('measures the offset toward the second lens as positive, in radians', () => {
    const toward = seamPosition(lenses, [Math.sin(0.1), 0, -Math.cos(0.1)]);
    expect(toward.offset).toBeCloseTo(Math.PI / 2 - 0.1, 9);
    const away = seamPosition(lenses, [0, Math.cos(0.2), Math.sin(0.2)]);
    expect(away.offset).toBeCloseTo(-0.2, 9);
  });
});

describe('the seam colour field', () => {
  const seam: SeamColour = {
    width: Math.PI / 4,
    offsets: Array.from({ length: SEAM_BINS }, (): Rgb => [0.2, 0.1, -0.1]),
  };

  it('moves each lens halfway toward the other at the seam', () => {
    const position = { azimuth: 1, offset: 0 };
    expectRgbClose(seamShift(seam, { position, lens: 0 }), [0.1, 0.05, -0.05], 9);
    expectRgbClose(seamShift(seam, { position, lens: 1 }), [-0.1, -0.05, 0.05], 9);
  });

  it('fades out across its width and leaves the rest of the sphere alone', () => {
    const halfway = seamShift(seam, { position: { azimuth: 0, offset: Math.PI / 8 }, lens: 0 });
    expectRgbClose(halfway, [0.05, 0.025, -0.025], 9);
    const beyond = seamShift(seam, { position: { azimuth: 0, offset: -1 }, lens: 0 });
    expect(beyond).toEqual([0, 0, 0]);
  });

  it('interpolates between neighbouring directions around the ring', () => {
    const ramp: SeamColour = {
      width: 1,
      offsets: Array.from({ length: SEAM_BINS }, (...[, bin]): Rgb => [bin === 1 ? 0.4 : 0, 0, 0]),
    };
    const step = (2 * Math.PI) / SEAM_BINS;
    const between = seamShift(ramp, {
      position: { azimuth: -Math.PI + 1.25 * step, offset: 0 },
      lens: 0,
    });
    expect(between[0]).toBeCloseTo(0.2 * 0.75, 9);
  });

  it('leaves a camera with other than two lenses alone', () => {
    expect(seamShift(seam, { position: { azimuth: 0, offset: 0 }, lens: 2 })).toEqual([0, 0, 0]);
  });
});

describe('estimating the seam colour', () => {
  it('measures the haze one lens adds where it adds it, and nothing elsewhere', () => {
    const seam = estimateSeamColour(lenses, [constant([0.2, 0.4, 0.7]), hazy(0.2)]);
    expect(seam.offsets).toHaveLength(SEAM_BINS);
    const sunward = seam.offsets[SEAM_BINS / 2]!;
    const shaded = seam.offsets[0]!;
    expect(sunward[0]).toBeGreaterThan(0.12);
    expect(Math.abs(shaded[0])).toBeLessThan(0.02);
  });

  it('agrees with the lenses it was measured on: corrected, they meet at the seam', () => {
    const samplers = [constant([0.2, 0.4, 0.7]), hazy(0.2)];
    const seam = estimateSeamColour(lenses, samplers);
    const direction: Vector3 = [Math.cos(0.3), Math.sin(0.3), 0];
    const position = seamPosition(lenses, direction);
    const colours = lenses.map((one, index) => {
      const sampled = samplers[index]!(project(one, direction).pixel);
      const shift = seamShift(seam, { position, lens: index });
      return sampled.map((value, channel) => value + (shift[channel] ?? 0));
    });
    expect(colours[0]![0]).toBeCloseTo(colours[1]![0]!, 1);
  });

  it('ignores a direction where the lenses see different things, and fills it from its neighbours', () => {
    const seam = estimateSeamColour(lenses, [constant([0.2, 0.4, 0.7]), striped]);
    for (const offset of seam.offsets) expect(Math.abs(offset[0])).toBeLessThan(0.05);
  });

  it('is no correction for a camera with other than two lenses', () => {
    const seam = estimateSeamColour([lens(0)], [constant([0.2, 0.4, 0.7])]);
    for (const offset of seam.offsets) expect(offset).toEqual([0, 0, 0]);
  });
});
