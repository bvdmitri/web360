import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readGyro } from './gyro';
import { readInfo } from './info';
import { readTrailer } from './trailer';

const u16le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const u32le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];
const u64le = (n: number): number[] => [...u32le(n % 2 ** 32), ...u32le(Math.floor(n / 2 ** 32))];
const sample = (
  ts: number,
  accel: [number, number, number],
  gyro: [number, number, number],
): number[] => [
  ...u64le(ts),
  ...u16le(accel[0]),
  ...u16le(accel[1]),
  ...u16le(accel[2]),
  ...u16le(gyro[0]),
  ...u16le(gyro[1]),
  ...u16le(gyro[2]),
];
const reader = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));
const ranges = { accelerometer: 32, gyroscope: 2000 };
const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('insta360 gyro record', () => {
  it('scales offset-binary samples to g and rad/s', () => {
    const bytes = [
      ...sample(1000, [49_152, 32_768, 32_768], [32_768, 32_768, 32_768]),
      ...sample(2000, [32_768, 32_768, 32_768], [49_152, 32_768, 32_768]),
    ];
    const samples = readGyro(reader(...bytes), { start: 0, end: bytes.length }, ranges);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual({
      timestamp: 1000,
      acceleration: [16, 0, 0],
      angularVelocity: [0, 0, 0],
    });
    expect(samples[1]?.timestamp).toBe(2000);
    expect(samples[1]?.angularVelocity[0]).toBeCloseTo((Math.PI / 180) * 1000, 4);
  });

  it('reads a real ONE R gyro track at 1 kHz', () => {
    const r = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const trailer = readTrailer(r);
    const info = trailer.records.find((rec) => rec.id === 1);
    const gyro = trailer.records.find((rec) => rec.id === 3);
    if (info === undefined || gyro === undefined) throw new Error('the fixture lacks a record');
    const read = readInfo(r, info.region);
    const samples = readGyro(r, gyro.region, {
      accelerometer: read.accelerometerRange,
      gyroscope: read.gyroscopeRange,
    });
    expect(samples).toHaveLength(145_232);
    expect(samples[0]?.timestamp).toBe(2_520_050);
    expect(samples[1]!.timestamp - samples[0]!.timestamp).toBe(1000);
    expect(Math.hypot(...samples[0]!.acceleration)).toBeCloseTo(1.02, 1);
  });
});
