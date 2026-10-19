import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { memorySource, type RandomAccessSource } from '../../ports/source';
import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from '../mp4/box';
import { MissingLensFileError, openInsta360 } from './open';
import { readInsta360Recording } from './recording';
import { NotInsta360Error, trailerLength } from './trailer';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);
const bytes = new Uint8Array(readFileSync(fixture));

// Records every range a reader asks for, so a test can pin that it skips the media.
const recorded = (
  source: RandomAccessSource,
): { source: RandomAccessSource; ranges: [number, number][] } => {
  const ranges: [number, number][] = [];
  return {
    source: {
      size: source.size,
      read: (offset, length): Promise<Uint8Array> => {
        ranges.push([offset, offset + length]);
        return source.read(offset, length);
      },
    },
    ranges,
  };
};

const BOX_HEADER = 16;

describe('opening an Insta360 recording from its files', () => {
  it('reads the recording as the whole-file reader does', async () => {
    const opened = await openInsta360({
      primary: memorySource(bytes),
      secondary: memorySource(bytes),
    });
    expect(opened.recording).toEqual(readInsta360Recording(ByteReader.of(bytes)));
    expect(opened.canvas).toEqual([6080, 3040]);
  });

  it('gives each lens of a split recording its own video and half of the canvas', async () => {
    const opened = await openInsta360({
      primary: memorySource(bytes),
      secondary: memorySource(bytes),
    });
    expect(opened.videos).toHaveLength(2);
    expect(opened.images).toEqual([
      { texture: 0, origin: [0, 0], extent: [3040, 3040] },
      { texture: 1, origin: [3040, 0], extent: [3040, 3040] },
    ]);
  });

  it('times each video sample in microseconds, in decode order', async () => {
    const opened = await openInsta360({
      primary: memorySource(bytes),
      secondary: memorySource(bytes),
    });
    const [video] = opened.videos;
    if (video === undefined) throw new Error('no video');
    expect(video).toMatchObject({ codec: 'avc1.4d4034', width: 2880, height: 2880 });
    expect(video.decoderConfig.length).toBeGreaterThan(0);
    expect(video.frames).toHaveLength(4299);
    const [first, second] = video.frames;
    expect(first).toMatchObject({ timestamp: 0, isSync: true });
    expect(second?.timestamp).toBeCloseTo(1_000_000 / (30_000 / 1001), 0);
    expect(opened.duration).toBeCloseTo(4299 / (30_000 / 1001), 2);
  });

  it('reads only box headers, the movie and the trailer', async () => {
    const reader = ByteReader.of(bytes);
    const moov = findBox(reader, regionOf(reader), 'moov');
    if (moov === undefined) throw new Error('the fixture has no moov box');
    const trailerStart = bytes.length - trailerLength(reader);
    const primary = recorded(memorySource(bytes));
    await openInsta360({ primary: primary.source, secondary: memorySource(bytes) });
    const elsewhere = primary.ranges.filter(
      ([start, end]) =>
        end - start > BOX_HEADER &&
        !(start >= moov.start && end <= moov.end) &&
        !(start >= trailerStart && end <= bytes.length),
    );
    expect(elsewhere).toEqual([]);
  });

  it('refuses one half of a split recording without the other', async () => {
    await expect(openInsta360({ primary: memorySource(bytes) })).rejects.toThrow(
      MissingLensFileError,
    );
  });

  it('refuses a file that is not an Insta360 recording', async () => {
    const plain = memorySource(new Uint8Array(200));
    await expect(openInsta360({ primary: plain })).rejects.toThrow(NotInsta360Error);
  });
});
