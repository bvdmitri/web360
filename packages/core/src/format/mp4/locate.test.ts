import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { memorySource, type RandomAccessSource } from '../../ports/source';
import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from './box';
import { readMovieFrom } from './locate';
import { readMovie, UnsupportedContainerError } from './movie';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

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

// Counts what a reader asks for, so a test can pin that it reads ranges, not the whole file.
const counted = (
  source: RandomAccessSource,
): { source: RandomAccessSource; bytes: () => number } => {
  let total = 0;
  return {
    source: {
      size: source.size,
      read: (offset, length): Promise<Uint8Array> => {
        total += length;
        return source.read(offset, length);
      },
    },
    bytes: () => total,
  };
};

describe('locating the movie in a source', () => {
  it('reads the same movie as the whole file, from a fraction of its bytes', async () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const reader = ByteReader.of(bytes);
    const moov = findBox(reader, regionOf(reader), 'moov');
    if (moov === undefined) throw new Error('the fixture has no moov box');
    const reading = counted(memorySource(bytes));

    const movie = await readMovieFrom(reading.source);

    expect(movie).toEqual(readMovie(reader, moov));
    expect(reading.bytes()).toBeLessThan(moov.size + 1024);
  });

  it('steps over a box whose size is in 64 bits and finds the movie after it', async () => {
    const large = [
      ...u32be(1),
      ...ascii('mdat'),
      ...u32be(0),
      ...u32be(24),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const bytes = new Uint8Array([...box('ftyp', [0, 0, 0, 0]), ...large, ...box('moov', [])]);
    await expect(readMovieFrom(memorySource(bytes))).rejects.toThrow(/mvhd/);
  });

  it('refuses a file without a movie, even when its last box runs to the end', async () => {
    const toEnd = [...u32be(0), ...ascii('mdat'), 1, 2, 3];
    const bytes = new Uint8Array([...box('ftyp', [0, 0, 0, 0]), ...toEnd]);
    await expect(readMovieFrom(memorySource(bytes))).rejects.toThrow(UnsupportedContainerError);
  });

  it('refuses a box header that claims less than a header', async () => {
    const bytes = new Uint8Array([...u32be(4), ...ascii('ftyp')]);
    await expect(readMovieFrom(memorySource(bytes))).rejects.toThrow(UnsupportedContainerError);
  });
});
