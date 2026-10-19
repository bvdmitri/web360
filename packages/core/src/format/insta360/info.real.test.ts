import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readInfo } from './info';
import { readTrailer } from './trailer';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('insta360 info record, on a real ONE R recording', () => {
  it('reads the camera, frame size, timing and gyro configuration', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const info = readTrailer(reader).records.find((record) => record.id === 1);
    if (info === undefined) throw new Error('the fixture has no info record');

    const read = readInfo(reader, info.region);
    expect(read.model).toBe('Insta360 OneR');
    expect([read.width, read.height]).toEqual([2880, 2880]);
    expect(read.frameRate).toBe(30);
    expect(read.firstFrameTimestamp).toBe(3_401_538);
    expect(read.rollingShutterMs).toBeCloseTo(22.28, 2);
    expect(read.gyroOffsetMs).toBe(1.5);
    expect(read.hasGyroOffset).toBe(true);
    expect(read.rawGyro).toBe(true);
    expect(read.accelerometerRange).toBe(32);
    expect(read.gyroscopeRange).toBe(2000);
    expect(read.calibration.startsWith('2_')).toBe(true);
  });
});
