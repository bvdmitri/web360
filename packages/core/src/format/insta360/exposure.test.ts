import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readExposure } from './exposure';
import { readTrailer } from './trailer';

const u32le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];
const u64le = (n: number): number[] => [...u32le(n % 2 ** 32), ...u32le(Math.floor(n / 2 ** 32))];
const f64le = (n: number): number[] => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n, true);
  return [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)];
};
const entry = (ts: number, exposure: number): number[] => [...u64le(ts), ...f64le(exposure)];
const reader = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));
const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('insta360 exposure record', () => {
  it('reads timestamp and exposure pairs', () => {
    const bytes = [...entry(1000, 0.005), ...entry(2000, 0.006)];
    const entries = readExposure(reader(...bytes), { start: 0, end: bytes.length });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ timestamp: 1000, exposure: 0.005 });
    expect(entries[1]?.exposure).toBe(0.006);
  });

  it('reads a real ONE R exposure track', () => {
    const r = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const exposure = readTrailer(r).records.find((rec) => rec.id === 4);
    if (exposure === undefined) throw new Error('the fixture has no exposure record');
    const entries = readExposure(r, exposure.region);
    expect(entries).toHaveLength(4325);
    expect(entries[0]?.timestamp).toBe(2_531_227);
    expect(entries[0]?.exposure).toBeCloseTo(0.00587, 4);
  });
});
