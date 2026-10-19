import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readBox } from './box';
import { readSampleFormat, readVisualSampleEntry } from './sampleEntry';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const box = (type: string, payload: number[]): number[] => [
  ...u32be(payload.length + 8),
  ...ascii(type),
  ...payload,
];
const fullBox = (type: string, fields: number[]): number[] => box(type, [0, 0, 0, 0, ...fields]);

const hvcC = (lengthSizeMinusOne: number): number[] =>
  box('hvcC', [...zeros(21), lengthSizeMinusOne]);
const avcC = (lengthSizeMinusOne: number): number[] =>
  box('avcC', [...zeros(4), lengthSizeMinusOne, ...zeros(5)]);

/** A visual sample entry box: the 78-byte fixed part with width and height, then its config box. */
const visualEntry = (format: string, size: [number, number], config: number[]): number[] =>
  box(format, [
    ...zeros(6),
    ...u16be(1),
    ...zeros(16),
    ...u16be(size[0]),
    ...u16be(size[1]),
    ...zeros(50),
    ...config,
  ]);

const open = (bytes: number[]): [ByteReader, ReturnType<typeof readBox>] => {
  const reader = ByteReader.of(Uint8Array.from(bytes));
  return [reader, readBox(reader, 0, reader.length)];
};

describe('mp4 sample entry', () => {
  it('reads an hvc1 visual entry with its dimensions and NAL length size', () => {
    const entry = visualEntry('hvc1', [2880, 2880], hvcC(3));
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b)).toEqual({
      format: 'hvc1',
      width: 2880,
      height: 2880,
      nalLengthSize: 4,
    });
  });

  it('reads an avc1 visual entry and its NAL length size', () => {
    const entry = visualEntry('avc1', [1920, 1080], avcC(1));
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b)).toEqual({
      format: 'avc1',
      width: 1920,
      height: 1080,
      nalLengthSize: 2,
    });
  });

  it('reports no NAL framing when neither config box is present', () => {
    const entry = visualEntry('mp4v', [640, 480], []);
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b).nalLengthSize).toBe(0);
  });

  it('reads the sample format of any track, including a data track', () => {
    const entry = box('gpmd', [...zeros(6), ...u16be(1)]);
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readSampleFormat(r, b)).toBe('gpmd');
  });
});
