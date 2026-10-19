import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { unproject } from '../optics/lens';
import {
  conjugate,
  fromRotationVector,
  identity,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { toDirection } from './equirectangular';
import { renderEquirectangular, type LensSampler } from './render';
import { stitchSample, type Shutter } from './sample';

const optics: LensOptics = {
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(190),
  coverage: degrees(190),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) },
};

// The camera turns about its vertical while the sensor is read out top to bottom: a row `y` was
// exposed with the camera turned by `TURN * (y - centre) / radius` relative to the frame's moment.
const TURN = 0.15;
const turnAt = (row: number): Quaternion =>
  fromRotationVector([0, 0, (TURN * (row - 1000)) / 1000]);
const shutter: Shutter = (lens, pixel) => (lens === 0 ? turnAt(pixel[1]) : identity());

const world = (direction: Vector3): number => {
  const longitude = Math.atan2(direction[1], direction[0]);
  const latitude = Math.asin(Math.max(-1, Math.min(1, direction[2])));
  return 1.5 + Math.sin(5 * longitude) * Math.cos(4 * latitude);
};

// What the rolling-shutter camera records: each pixel saw the world through its row's turn.
const recorded: LensSampler = (pixel) => {
  const untilRow = conjugate(turnAt(pixel[1]));
  const value = world(rotate(untilRow, unproject(optics, pixel)));
  return [value, value, value];
};

const worstError = (isCorrected: boolean): number => {
  const width = 48;
  const height = 24;
  const pixels = renderEquirectangular({
    lenses: [optics],
    samplers: [recorded],
    correction: identity(),
    width,
    height,
    ...(isCorrected && { shutter }),
  });
  let worst = 0;
  for (const [index, pixel] of pixels.entries()) {
    const direction = toDirection(
      ((index % width) + 0.5) / width,
      (Math.floor(index / width) + 0.5) / height,
    );
    if (direction[2] < 0.2 || pixel[0] === 0) continue;
    worst = Math.max(worst, Math.abs(pixel[0] - world(direction)));
  }
  return worst;
};

describe('rolling shutter', () => {
  it('restores the scene a turning camera smeared across its rows', () => {
    const without = worstError(false);
    const corrected = worstError(true);
    expect(without).toBeGreaterThan(0.2);
    expect(corrected).toBeLessThan(without / 10);
  });

  it('samples each lens at the pixel its own row turn points to', () => {
    const direction: Vector3 = [0.3, 0.2, 0.93];
    const [plain] = stitchSample([optics], direction);
    const [turned] = stitchSample([optics], direction, shutter);
    expect(turned?.pixel).not.toEqual(plain?.pixel);
  });

  it('changes nothing when every row shares the frame moment', () => {
    const direction: Vector3 = [0.3, 0.2, 0.93];
    expect(stitchSample([optics], direction, () => identity())).toEqual(
      stitchSample([optics], direction),
    );
  });
});
