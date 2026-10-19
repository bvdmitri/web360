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
    expect(readVisualSampleEntry(r, b)).toMatchObject({
      format: 'hvc1',
      width: 2880,
      height: 2880,
      nalLengthSize: 4,
    });
  });

  it('reads an avc1 visual entry and its NAL length size', () => {
    const entry = visualEntry('avc1', [1920, 1080], avcC(1));
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b)).toMatchObject({
      format: 'avc1',
      width: 1920,
      height: 1080,
      nalLengthSize: 2,
    });
  });

  it('reports no NAL framing, no decoder configuration and a bare codec without a config box', () => {
    const entry = visualEntry('mp4v', [640, 480], []);
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b)).toMatchObject({
      nalLengthSize: 0,
      codec: 'mp4v',
      decoderConfig: new Uint8Array(),
    });
  });

  it('names an H.264 codec by its profile, compatibility and level, with the avcC as its configuration', () => {
    const config = [1, 0x4d, 0x40, 0x34, 0xff, 0xe1, 0, 0];
    const entry = visualEntry('avc1', [2880, 2880], box('avcC', config));
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b)).toMatchObject({
      codec: 'avc1.4d4034',
      decoderConfig: Uint8Array.from(config),
    });
  });

  it('names an HEVC codec by profile, reversed compatibility flags, tier, level and constraints', () => {
    const config = [1, 0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 153, ...zeros(8), 0x0f];
    const entry = visualEntry('hvc1', [3840, 1920], box('hvcC', config));
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b).codec).toBe('hvc1.1.6.L153.B0');
  });

  it('marks a high-tier HEVC profile space and keeps inner zero constraint bytes', () => {
    const config = [1, 0b0110_0010, 0, 0, 0, 0x01, 0x90, 0, 0x08, 0, 0, 0, 120, ...zeros(8), 0x0f];
    const entry = visualEntry('hev1', [3840, 1920], box('hvcC', config));
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readVisualSampleEntry(r, b).codec).toBe('hev1.A2.80000000.H120.90.0.8');
  });

  it('reads the sample format of any track, including a data track', () => {
    const entry = box('gpmd', [...zeros(6), ...u16be(1)]);
    const [r, b] = open(fullBox('stsd', [...u32be(1), ...entry]));
    expect(readSampleFormat(r, b)).toBe('gpmd');
  });
});
