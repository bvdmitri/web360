import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { boxesIn, findBox, MalformedBoxError, payloadOf, readBox, regionOf } from './box';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const u64be = (n: number): number[] => [...u32be(Math.floor(n / 2 ** 32)), ...u32be(n % 2 ** 32)];

/** A 32-bit-size box: `size(4) type(4) payload`. */
const box = (type: string, payload: number[] = []): number[] => [
  ...u32be(payload.length + 8),
  ...ascii(type),
  ...payload,
];

/** A 64-bit-largesize box: `1 type(4) largesize(8) payload`. */
const largeBox = (type: string, payload: number[] = []): number[] => [
  ...u32be(1),
  ...ascii(type),
  ...u64be(payload.length + 16),
  ...payload,
];

const readerOf = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));

describe('mp4 box', () => {
  it('reads a 32-bit-size box into its type and byte ranges', () => {
    const r = readerOf(...box('ftyp', [1, 2, 3, 4]));
    expect(readBox(r, 0, r.length)).toEqual({
      type: 'ftyp',
      start: 0,
      size: 12,
      end: 12,
      payloadStart: 8,
      payloadSize: 4,
    });
  });

  it('reads a 64-bit-largesize box, whose header is sixteen bytes', () => {
    const r = readerOf(...largeBox('mdat', [9, 9]));
    expect(readBox(r, 0, r.length)).toMatchObject({
      type: 'mdat',
      size: 18,
      payloadStart: 16,
      payloadSize: 2,
      end: 18,
    });
  });

  it('reads a size-zero box as running to the end of the region', () => {
    const r = readerOf(...u32be(0), ...ascii('mdat'), 7, 7, 7);
    expect(readBox(r, 0, r.length)).toMatchObject({
      type: 'mdat',
      size: 11,
      end: 11,
      payloadStart: 8,
      payloadSize: 3,
    });
  });

  it('refuses a box smaller than its own header', () => {
    const r = readerOf(...u32be(4), ...ascii('junk'));
    expect(() => readBox(r, 0, r.length)).toThrow(MalformedBoxError);
  });

  it('refuses a box that runs past the region it is read within', () => {
    const r = readerOf(...box('moov', [1, 2, 3, 4]));
    expect(() => readBox(r, 0, 10)).toThrow(MalformedBoxError);
  });

  it('walks sibling boxes in order with their absolute offsets', () => {
    const r = readerOf(
      ...box('ftyp', [0, 0, 0, 0]),
      ...box('free'),
      ...box('mdat', [1, 2, 3, 4, 5, 6]),
    );
    const boxes = [...boxesIn(r, regionOf(r))];
    expect(boxes.map((b) => b.type)).toEqual(['ftyp', 'free', 'mdat']);
    expect(boxes.map((b) => b.start)).toEqual([0, 12, 20]);
    expect(boxes.map((b) => b.size)).toEqual([12, 8, 14]);
  });

  it('finds a box by type and reports its absence as undefined', () => {
    const r = readerOf(...box('ftyp'), ...box('mdat', [1, 2]));
    expect(findBox(r, regionOf(r), 'mdat')?.start).toBe(8);
    expect(findBox(r, regionOf(r), 'moov')).toBeUndefined();
  });

  it('walks the children inside a container box through its payload region', () => {
    const r = readerOf(...box('moov', [...box('mvhd', [1, 2, 3, 4]), ...box('trak', [5, 6])]));
    const moov = readBox(r, 0, r.length);
    expect([...boxesIn(r, payloadOf(moov))].map((b) => b.type)).toEqual(['mvhd', 'trak']);
  });

  it('recovers the type and payload length of every box in a random sequence', () => {
    const fourcc = fc
      .array(fc.integer({ min: 0x61, max: 0x7a }), { minLength: 4, maxLength: 4 })
      .map((codes) => String.fromCodePoint(...codes));
    const payload = fc.array(fc.integer({ min: 0, max: 0xff }), { maxLength: 24 });
    const sequence = fc.array(fc.tuple(fourcc, payload), { maxLength: 12 });
    fc.assert(
      fc.property(sequence, (specs) => {
        const r = ByteReader.of(
          Uint8Array.from(specs.flatMap(([type, bytes]) => box(type, bytes))),
        );
        const boxes = [...boxesIn(r, regionOf(r))];
        expect(boxes.map((b) => b.type)).toEqual(specs.map(([type]) => type));
        expect(boxes.map((b) => b.payloadSize)).toEqual(specs.map(([, bytes]) => bytes.length));
      }),
    );
  });
});
