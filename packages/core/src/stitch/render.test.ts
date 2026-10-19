import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { identity, type Quaternion } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { renderEquirectangular, type LensSampler, type Rgb, type Scene } from './render';

const lens = (pitch: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(193),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(pitch), roll: degrees(0) },
});

const constant =
  (colour: Rgb): LensSampler =>
  () =>
    colour;
const red: Rgb = [1, 0, 0];
const blue: Rgb = [0, 0, 1];

const scene = (overrides: Partial<Scene>): Scene => ({
  lenses: [lens(0), lens(180)],
  samplers: [constant(red), constant(blue)],
  correction: identity(),
  width: 1,
  height: 1,
  ...overrides,
});

const expectRgbClose = (a: Rgb, b: Rgb): void => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
  expect(a[2]).toBeCloseTo(b[2], 6);
};

describe('equirectangular render', () => {
  it('takes the up column from the front lens and the down column from the back', () => {
    const pixels = renderEquirectangular(scene({ width: 1, height: 3 }));
    expect(pixels).toHaveLength(3);
    expectRgbClose(pixels[0]!, red); // v near 0, looking up
    expectRgbClose(pixels[2]!, blue); // v near 1, looking down
  });

  it('blends the lenses evenly across the equatorial seam', () => {
    const [equator] = renderEquirectangular(scene({ width: 1, height: 1 }));
    expectRgbClose(equator!, [0.5, 0, 0.5]);
  });

  it('is black where no lens covers the direction', () => {
    const narrow: LensOptics = { ...lens(0), fieldOfView: degrees(60) };
    const [equator] = renderEquirectangular(
      scene({ lenses: [narrow], samplers: [constant(red)], width: 1, height: 1 }),
    );
    expectRgbClose(equator!, [0, 0, 0]);
  });

  it('is black where a lens has no sampler', () => {
    const [down] = renderEquirectangular(
      scene({ samplers: [constant(red)], width: 1, height: 1, correction: downward() }),
    );
    expectRgbClose(down!, [0, 0, 0]);
  });
});

// A correction that turns the equator-facing centre direction to look straight down, so the single
// front sampler does not cover it and the missing back sampler is exercised.
function downward(): Quaternion {
  return { w: Math.SQRT1_2, x: 0, y: Math.SQRT1_2, z: 0 };
}
