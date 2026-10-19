import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { identity } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { estimateGains } from './gains';
import { renderEquirectangular, type LensSampler, type Rgb } from './render';

const lens = (fovDegrees: number, roll: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(fovDegrees),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(roll) },
});

const constant =
  (colour: Rgb): LensSampler =>
  () =>
    colour;
const front = lens(193, 0);
const back = lens(193, 180);
const grid = { width: 64, height: 32 };

const expectRgbClose = (a: Rgb | undefined, b: Rgb): void => {
  expect(a?.[0]).toBeCloseTo(b[0], 6);
  expect(a?.[1]).toBeCloseTo(b[1], 6);
  expect(a?.[2]).toBeCloseTo(b[2], 6);
};

describe('gain matching', () => {
  it('scales two lenses to their geometric mean over the overlap', () => {
    const gains = estimateGains(
      [front, back],
      [constant([0.8, 0.8, 0.8]), constant([0.2, 0.2, 0.2])],
      grid,
    );
    expectRgbClose(gains[0], [0.5, 0.5, 0.5]);
    expectRgbClose(gains[1], [2, 2, 2]);
  });

  it('makes the seam continuous once the gains are applied', () => {
    const samplers = [constant([0.8, 0.4, 0.6]), constant([0.4, 0.2, 0.3])];
    const lenses = [front, back];
    const gains = estimateGains(lenses, samplers, grid);
    const column = renderEquirectangular({
      lenses,
      samplers,
      gains,
      correction: identity(),
      width: 1,
      height: 9,
    });
    for (const pixel of column) expectRgbClose(pixel, column[0]!);
  });

  it('leaves a lens alone when it shares no overlap', () => {
    const gains = estimateGains([lens(60, 0)], [constant([0.5, 0.5, 0.5])], grid);
    expectRgbClose(gains[0], [1, 1, 1]);
  });

  it('leaves a channel alone when either lens records nothing in it', () => {
    const gains = estimateGains(
      [front, back],
      [constant([0.8, 0, 0.8]), constant([0.2, 0.5, 0.2])],
      grid,
    );
    expect(gains[0]?.[1]).toBe(1);
    expect(gains[1]?.[1]).toBe(1);
  });

  it('skips a lens that has no sampler', () => {
    const gains = estimateGains([front, back], [constant([0.5, 0.5, 0.5])], grid);
    expectRgbClose(gains[0], [1, 1, 1]);
  });
});
