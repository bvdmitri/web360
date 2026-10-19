import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readCalibration, UnsupportedCalibrationError } from './calibration';
import { readInfo } from './info';
import { readTrailer } from './trailer';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('insta360 calibration', () => {
  it('parses a v1 string into per-lens poses and the canvas', () => {
    const cal = readCalibration('2_100_200_300_10_20_30_400_500_600_40_50_60_6000_3000_1');
    expect(cal.canvas).toEqual([6000, 3000]);
    expect(cal.lenses).toEqual([
      { radius: 100, center: [200, 300], yaw: 10, pitch: 20, roll: 30 },
      { radius: 400, center: [500, 600], yaw: 40, pitch: 50, roll: 60 },
    ]);
  });

  it('refuses a string that is not the v1 layout', () => {
    expect(() => readCalibration('2_1_2_3')).toThrow(UnsupportedCalibrationError);
    expect(() =>
      readCalibration('2_100_200_300_10_20_30_400_500_600_40_50_60_6000_3000_1_99'),
    ).toThrow(UnsupportedCalibrationError);
  });

  it('reads the real ONE R calibration', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const info = readTrailer(reader).records.find((record) => record.id === 1);
    if (info === undefined) throw new Error('the fixture has no info record');
    const cal = readCalibration(readInfo(reader, info.region).calibration);
    expect(cal.lenses).toHaveLength(2);
    expect(cal.canvas).toEqual([6080, 3040]);
    expect(cal.lenses[0]?.radius).toBeCloseTo(1476.98, 2);
    expect(cal.lenses[0]?.center).toEqual([1514.07, 1523.14]);
    expect(cal.lenses[0]?.roll).toBeCloseTo(-179.115, 3);
    expect(cal.lenses[1]?.center[0]).toBeCloseTo(4557.13, 2);
  });
});
