import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { NotInsta360Error, readTrailer } from './trailer';

const MAGIC = '8db42d694ccc418790edff439fe026bf';
const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u32le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);

/** A record: its payload, then the 6-byte header (format, id, payload size) that follows it. */
const record = (format: number, id: number, payload: number[]): number[] => [
  ...payload,
  format,
  id,
  ...u32le(payload.length),
];
const footer = (trailerSize: number, version: number): number[] => [
  ...zeros(32),
  ...u32le(trailerSize),
  ...u32le(version),
  ...ascii(MAGIC),
];
const reader = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));

describe('insta360 trailer', () => {
  it('walks a contiguous trailer backward from the footer', () => {
    const body = [...record(0, 12, []), ...record(0, 3, [1, 2, 3, 4]), ...record(1, 1, [9, 9])];
    const r = reader(...zeros(10), ...body, ...footer(body.length + 72, 3));
    const trailer = readTrailer(r);
    expect(trailer.version).toBe(3);
    expect(trailer.records.map((rec) => rec.id).toSorted((a, b) => a - b)).toEqual([1, 3, 12]);
    const gyro = trailer.records.find((rec) => rec.id === 3);
    expect(gyro).toBeDefined();
    expect([...r.bytes(gyro!.region.start, 4)]).toEqual([1, 2, 3, 4]);
  });

  it('rejects a file without the Insta360 magic', () => {
    expect(() => readTrailer(reader(...zeros(80)))).toThrow(NotInsta360Error);
  });

  it('resolves records through an index when the near-footer record is one', () => {
    const slot = [3, 0, ...u32le(4), ...u32le(0)];
    const body = [10, 11, 12, 13, ...record(0, 0, slot)];
    const r = reader(...body, ...footer(body.length + 72, 3));
    const trailer = readTrailer(r);
    const indexed = trailer.records.find((rec) => rec.id === 3);
    expect(indexed).toBeDefined();
    expect([...r.bytes(indexed!.region.start, 4)]).toEqual([10, 11, 12, 13]);
  });
});
