import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readBox } from './box';
import { readHandlerType, readTimescale, readTrackId } from './movieHeader';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const u64be = (n: number): number[] => [...u32be(Math.floor(n / 2 ** 32)), ...u32be(n % 2 ** 32)];
const box = (type: string, payload: number[]): number[] => [
  ...u32be(payload.length + 8),
  ...ascii(type),
  ...payload,
];
const fullBox = (type: string, version: number, fields: number[]): number[] =>
  box(type, [version, 0, 0, 0, ...fields]);
const times = (version: number): number[] =>
  version === 1 ? [...u64be(0), ...u64be(0)] : [...u32be(0), ...u32be(0)];

const header = (
  type: string,
  version: number,
  fields: number[],
): [ByteReader, ReturnType<typeof readBox>] => {
  const reader = ByteReader.of(Uint8Array.from(fullBox(type, version, fields)));
  return [reader, readBox(reader, 0, reader.length)];
};

describe('mp4 movie header', () => {
  it('reads the movie timescale from either header version', () => {
    const [r0, b0] = header('mvhd', 0, [...times(0), ...u32be(1000), ...u32be(0)]);
    expect(readTimescale(r0, b0)).toBe(1000);
    const [r1, b1] = header('mvhd', 1, [...times(1), ...u32be(48_000), ...u64be(0)]);
    expect(readTimescale(r1, b1)).toBe(48_000);
  });

  it('reads the media timescale the same way', () => {
    const [r, b] = header('mdhd', 0, [...times(0), ...u32be(90_000), ...u32be(0)]);
    expect(readTimescale(r, b)).toBe(90_000);
  });

  it('reads the track id from either header version', () => {
    const [r0, b0] = header('tkhd', 0, [...times(0), ...u32be(7), ...u32be(0), ...u32be(0)]);
    expect(readTrackId(r0, b0)).toBe(7);
    const [r1, b1] = header('tkhd', 1, [...times(1), ...u32be(9), ...u32be(0), ...u64be(0)]);
    expect(readTrackId(r1, b1)).toBe(9);
  });

  it('reads the handler type', () => {
    const [r, b] = header('hdlr', 0, [
      ...u32be(0),
      ...ascii('vide'),
      ...u32be(0),
      ...u32be(0),
      ...u32be(0),
    ]);
    expect(readHandlerType(r, b)).toBe('vide');
  });

  it('reads any timescale whatever the header version', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0x7f_ff_ff_ff }), fc.boolean(), (timescale, wide) => {
        const [r, b] = header('mdhd', wide ? 1 : 0, [
          ...times(wide ? 1 : 0),
          ...u32be(timescale),
          ...u32be(0),
        ]);
        expect(readTimescale(r, b)).toBe(timescale);
      }),
    );
  });
});
