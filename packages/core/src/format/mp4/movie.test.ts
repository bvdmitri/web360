import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readBox } from './box';
import { readMovie, samplesOf, UnsupportedContainerError } from './movie';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const u64be = (n: number): number[] => [...u32be(Math.floor(n / 2 ** 32)), ...u32be(n % 2 ** 32)];
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const box = (type: string, payload: number[]): number[] => [
  ...u32be(payload.length + 8),
  ...ascii(type),
  ...payload,
];
const fullBox = (type: string, version: number, fields: number[]): number[] =>
  box(type, [version, 0, 0, 0, ...fields]);
const times = (): number[] => [...u32be(0), ...u32be(0)];

const hvcC = (lengthSizeMinusOne: number): number[] =>
  box('hvcC', [...zeros(21), lengthSizeMinusOne]);
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

const stts = (count: number, delta: number): number[] =>
  fullBox('stts', 0, [...u32be(1), ...u32be(count), ...u32be(delta)]);
const stsz = (sizes: number[]): number[] =>
  fullBox('stsz', 0, [...u32be(0), ...u32be(sizes.length), ...sizes.flatMap((n) => u32be(n))]);
const stsc = (samplesPerChunk: number): number[] =>
  fullBox('stsc', 0, [...u32be(1), ...u32be(1), ...u32be(samplesPerChunk), ...u32be(1)]);
const stco = (offset: number): number[] => fullBox('stco', 0, [...u32be(1), ...u32be(offset)]);
const co64 = (offset: number): number[] => fullBox('co64', 0, [...u32be(1), ...u64be(offset)]);
const ctts = (count: number, offset: number): number[] =>
  fullBox('ctts', 0, [...u32be(1), ...u32be(count), ...u32be(offset)]);
const stss = (nums: number[]): number[] =>
  fullBox('stss', 0, [...u32be(nums.length), ...nums.flatMap((n) => u32be(n))]);

const mdhd = (timescale: number): number[] =>
  fullBox('mdhd', 0, [...times(), ...u32be(timescale), ...u32be(0)]);
const hdlr = (handler: string): number[] =>
  fullBox('hdlr', 0, [...u32be(0), ...ascii(handler), ...zeros(12)]);
const tkhd = (id: number): number[] =>
  fullBox('tkhd', 0, [...times(), ...u32be(id), ...u32be(0), ...u32be(0)]);
const mvhd = (timescale: number): number[] =>
  fullBox('mvhd', 0, [...times(), ...u32be(timescale), ...u32be(0)]);

const open = (bytes: number[]): ReturnType<typeof readMovie> => {
  const reader = ByteReader.of(Uint8Array.from(bytes));
  return readMovie(reader, readBox(reader, 0, reader.length));
};

describe('mp4 movie', () => {
  it('assembles a video track with its samples placed and timed', () => {
    const stsd = fullBox('stsd', 0, [...u32be(1), ...visualEntry('hvc1', [1920, 1080], hvcC(3))]);
    const tables = [
      ...stts(2, 3000),
      ...ctts(2, 0),
      ...stss([1, 2]),
      ...stsz([5000, 6000]),
      ...stsc(2),
      ...stco(9000),
    ];
    const stbl = box('stbl', [...stsd, ...tables]);
    const mdia = box('mdia', [...mdhd(90_000), ...hdlr('vide'), ...box('minf', [...stbl])]);
    const trak = box('trak', [...tkhd(1), ...mdia]);
    const movie = open(box('moov', [...mvhd(1000), ...trak]));

    expect(movie.timescale).toBe(1000);
    expect(movie.tracks).toHaveLength(1);
    const [track] = movie.tracks;
    if (track === undefined) throw new Error('the movie has no track');
    expect(track).toMatchObject({ id: 1, handler: 'vide', timescale: 90_000 });
    expect(track.sampleEntry).toEqual({
      format: 'hvc1',
      width: 1920,
      height: 1080,
      nalLengthSize: 4,
    });
    expect(samplesOf(track)).toEqual([
      { offset: 9000, size: 5000, decodeTime: 0, compositionTime: 0, duration: 3000, isSync: true },
      {
        offset: 14_000,
        size: 6000,
        decodeTime: 3000,
        compositionTime: 3000,
        duration: 3000,
        isSync: true,
      },
    ]);
  });

  it('reads a sound track with no visual sample entry', () => {
    const stbl = box('stbl', [...stts(1, 1024), ...stsz([512]), ...stsc(1), ...co64(40_000)]);
    const mdia = box('mdia', [...mdhd(48_000), ...hdlr('soun'), ...box('minf', [...stbl])]);
    const trak = box('trak', [...tkhd(2), ...mdia]);
    const movie = open(box('moov', [...mvhd(1000), ...trak]));

    const [track] = movie.tracks;
    if (track === undefined) throw new Error('the movie has no track');
    expect(track.handler).toBe('soun');
    expect(track.sampleEntry).toBeUndefined();
    expect(samplesOf(track)).toHaveLength(1);
  });

  it('refuses a fragmented file', () => {
    const moov = box('moov', [...mvhd(1000), ...box('mvex', [])]);
    expect(() => open(moov)).toThrow(UnsupportedContainerError);
  });

  it('refuses a movie missing a required box', () => {
    expect(() => open(box('moov', []))).toThrow(UnsupportedContainerError);
  });
});
