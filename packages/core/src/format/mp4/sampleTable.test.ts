import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { MalformedBoxError, readBox } from './box';
import {
  readChunkOffsets32,
  readChunkOffsets64,
  readCompositionOffsets,
  readSampleSizes,
  readSampleToChunk,
  readSyncSamples,
  readTimeToSample,
} from './sampleTable';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const signed32be = (n: number): number[] => u32be(n >>> 0);
const u64be = (n: number): number[] => [...u32be(Math.floor(n / 2 ** 32)), ...u32be(n % 2 ** 32)];
const box = (type: string, payload: number[]): number[] => [
  ...u32be(payload.length + 8),
  ...ascii(type),
  ...payload,
];
const fullBox = (type: string, fields: number[]): number[] => box(type, [0, 0, 0, 0, ...fields]);

/** A reader over one full box and the box itself, ready to hand to a table parser. */
const table = (type: string, fields: number[]): [ByteReader, ReturnType<typeof readBox>] => {
  const reader = ByteReader.of(Uint8Array.from(fullBox(type, fields)));
  return [reader, readBox(reader, 0, reader.length)];
};

describe('mp4 sample table', () => {
  it('reads time-to-sample runs', () => {
    const [r, b] = table('stts', [
      ...u32be(2),
      ...u32be(3),
      ...u32be(100),
      ...u32be(1),
      ...u32be(50),
    ]);
    expect(readTimeToSample(r, b)).toEqual([
      { count: 3, delta: 100 },
      { count: 1, delta: 50 },
    ]);
  });

  it('reads composition offsets, which may be negative', () => {
    const [r, b] = table('ctts', [...u32be(1), ...u32be(2), ...signed32be(-10)]);
    expect(readCompositionOffsets(r, b)).toEqual([{ count: 2, offset: -10 }]);
  });

  it('reads sync sample numbers', () => {
    const [r, b] = table('stss', [...u32be(2), ...u32be(5), ...u32be(9)]);
    expect(readSyncSamples(r, b)).toEqual([5, 9]);
  });

  it('reads a uniform sample size without a per-sample table', () => {
    const [r, b] = table('stsz', [...u32be(1000), ...u32be(4)]);
    expect(readSampleSizes(r, b)).toEqual({ count: 4, uniformSize: 1000, sizes: [] });
  });

  it('reads per-sample sizes when the uniform size is zero', () => {
    const [r, b] = table('stsz', [
      ...u32be(0),
      ...u32be(3),
      ...u32be(10),
      ...u32be(20),
      ...u32be(30),
    ]);
    expect(readSampleSizes(r, b)).toEqual({ count: 3, uniformSize: 0, sizes: [10, 20, 30] });
  });

  it('reads sample-to-chunk runs', () => {
    const [r, b] = table('stsc', [...u32be(1), ...u32be(1), ...u32be(4), ...u32be(1)]);
    expect(readSampleToChunk(r, b)).toEqual([
      { firstChunk: 1, samplesPerChunk: 4, descriptionIndex: 1 },
    ]);
  });

  it('reads 32-bit and 64-bit chunk offsets', () => {
    const [small, sb] = table('stco', [...u32be(2), ...u32be(100), ...u32be(200)]);
    expect(readChunkOffsets32(small, sb)).toEqual([100, 200]);
    const [large, lb] = table('co64', [...u32be(2), ...u64be(2 ** 32), ...u64be(5)]);
    expect(readChunkOffsets64(large, lb)).toEqual([2 ** 32, 5]);
  });

  it('refuses a table whose entry count overflows its box', () => {
    const [r, b] = table('stco', [...u32be(5)]);
    expect(() => readChunkOffsets32(r, b)).toThrow(MalformedBoxError);
  });

  it('recovers any list of time-to-sample runs', () => {
    const run = fc.record({
      count: fc.integer({ min: 0, max: 0xff_ff }),
      delta: fc.integer({ min: 0, max: 0xff_ff }),
    });
    fc.assert(
      fc.property(fc.array(run, { maxLength: 20 }), (list) => {
        const fields = [
          ...u32be(list.length),
          ...list.flatMap((entry) => [...u32be(entry.count), ...u32be(entry.delta)]),
        ];
        const [r, b] = table('stts', fields);
        expect(readTimeToSample(r, b)).toEqual(list);
      }),
    );
  });
});
