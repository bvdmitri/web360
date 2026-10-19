import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readBox } from './box';
import { readFullBox } from './fullBox';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const box = (type: string, payload: number[]): number[] => [
  ...u32be(payload.length + 8),
  ...ascii(type),
  ...payload,
];
const readerOf = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));

describe('mp4 full box', () => {
  it('reads the version and points past the four-byte version and flags', () => {
    const r = readerOf(...box('mdhd', [1, 0, 0, 0, 7, 7, 7, 7]));
    expect(readFullBox(r, readBox(r, 0, r.length))).toEqual({ version: 1, fieldsStart: 12 });
  });

  it('reads a version-zero box', () => {
    const r = readerOf(...box('stsz', [0, 0, 0, 0]));
    expect(readFullBox(r, readBox(r, 0, r.length)).version).toBe(0);
  });
});
