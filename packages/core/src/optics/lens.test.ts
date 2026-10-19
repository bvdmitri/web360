import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { readCalibration } from '../format/insta360/calibration';
import { readInfo } from '../format/insta360/info';
import { readTrailer } from '../format/insta360/trailer';
import type { LensOptics } from '../model/recording';
import { ByteReader } from '../shared/binary/byteReader';
import type { Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { project, unproject } from './lens';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/insta360/oner-split-00.insv',
);

const lens = (overrides: Partial<LensOptics> = {}): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(193),
  center: [1500, 1400],
  orientation: { yaw: degrees(20), pitch: degrees(-15), roll: degrees(170) },
  ...overrides,
});

const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
  expect(a[2]).toBeCloseTo(b[2], 6);
};

describe('equidistant lens optics', () => {
  it('projects the optical axis to the lens centre at zero angle', () => {
    const optics = lens();
    const axis = unproject(optics, optics.center);
    const projected = project(optics, axis);
    expect(projected.pixel[0]).toBeCloseTo(optics.center[0], 6);
    expect(projected.pixel[1]).toBeCloseTo(optics.center[1], 6);
    expect(projected.angle).toBeCloseTo(0, 6);
    expect(projected.covered).toBe(true);
  });

  it('places the field-of-view edge at the fisheye radius', () => {
    const optics = lens();
    const edge = unproject(optics, [optics.center[0] + optics.radius, optics.center[1]]);
    const projected = project(optics, edge);
    expect(projected.angle).toBeCloseTo((degrees(193) * Math.PI) / 180 / 2, 6);
    const dx = projected.pixel[0] - optics.center[0];
    const dy = projected.pixel[1] - optics.center[1];
    expect(Math.hypot(dx, dy)).toBeCloseTo(optics.radius, 4);
  });

  it('marks a direction beyond the field of view as not covered', () => {
    const optics = lens();
    const beyond = unproject(optics, [optics.center[0] + optics.radius * 1.2, optics.center[1]]);
    expect(project(optics, beyond).covered).toBe(false);
  });

  it('round-trips a pixel inside the fisheye circle through unproject then project', () => {
    const optics = lens();
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (fraction, azimuth) => {
          const r = fraction * optics.radius;
          const pixel: readonly [number, number] = [
            optics.center[0] + r * Math.cos(azimuth),
            optics.center[1] + r * Math.sin(azimuth),
          ];
          const reprojected = project(optics, unproject(optics, pixel)).pixel;
          expect(reprojected[0]).toBeCloseTo(pixel[0], 4);
          expect(reprojected[1]).toBeCloseTo(pixel[1], 4);
        },
      ),
    );
  });

  it('rolls a back lens about Y so its azimuth stays in register with the front lens', () => {
    const back = lens({ orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(180) } });
    expectVecClose(unproject(back, back.center), [0, 0, -1]);
    expect(project(back, [1, 0, 0]).pixel[0]).toBeLessThan(back.center[0]);
  });

  it('reads the real ONE R calibration into a usable lens', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const info = readTrailer(reader).records.find((record) => record.id === 1);
    if (info === undefined) throw new Error('the fixture has no info record');
    const pose = readCalibration(readInfo(reader, info.region).calibration).lenses[0];
    if (pose === undefined) throw new Error('the calibration has no lens');

    const optics = lens({
      radius: pose.radius,
      center: pose.center,
      orientation: { yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll },
    });
    const axis = unproject(optics, optics.center);
    expectVecClose(unproject(optics, project(optics, axis).pixel), axis);
  });
});
