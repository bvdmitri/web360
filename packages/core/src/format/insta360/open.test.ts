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

const asciiAt = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.codePointAt(0) ?? 0);
const indexOfBytes = (haystack: Uint8Array, needle: Uint8Array, from = 0): number => {
  for (let at = from; at <= haystack.length - needle.length; at += 1) {
    if (needle.every((byte, offset) => haystack[at + offset] === byte)) return at;
  }
  return -1;
};

// The fixture with its moov rewritten by `change`, which receives the moov's bytes.
const withMovie = (change: (moov: Uint8Array) => Uint8Array): Uint8Array => {
  const reader = ByteReader.of(bytes);
  const moov = findBox(reader, regionOf(reader), 'moov');
  if (moov === undefined) throw new Error('the fixture has no moov box');
  const changed = change(bytes.slice(moov.start, moov.end));
  new DataView(changed.buffer).setUint32(0, changed.length);
  return Uint8Array.from([
    ...bytes.subarray(0, moov.start),
    ...changed,
    ...bytes.subarray(moov.end),
  ]);
};

// The moov with its first track (the video) appearing twice, as a camera with a track per lens.
const twoVideoTracks = (moov: Uint8Array): Uint8Array => {
  const reader = ByteReader.of(moov);
  const trak = findBox(reader, { start: 8, end: moov.length }, 'trak');
  if (trak === undefined) throw new Error('the movie has no track');
  return Uint8Array.from([...moov, ...moov.subarray(trak.start, trak.end)]);
};

// The moov with its video sample entry claiming the whole canvas, as a one-video camera.
const wholeCanvasVideo = (moov: Uint8Array): Uint8Array => {
  const entry = indexOfBytes(moov, asciiAt('avc1'));
  const view = new DataView(moov.buffer);
  view.setUint16(entry + 28, 6080);
  view.setUint16(entry + 30, 3040);
  return moov;
};

// The moov with no video handler left.
const noVideo = (moov: Uint8Array): Uint8Array => {
  let at = indexOfBytes(moov, asciiAt('vide'));
  while (at >= 0) {
    moov.set(asciiAt('meta'), at);
    at = indexOfBytes(moov, asciiAt('vide'), at + 4);
  }
  return moov;
};

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

  it('reads each lens from its own track when one file carries a track per lens', async () => {
    const file = memorySource(withMovie(twoVideoTracks));
    const opened = await openInsta360({ primary: file });
    expect(opened.videos).toHaveLength(2);
    expect(opened.sources).toEqual([file, file]);
    expect(opened.images[1]).toEqual({ texture: 1, origin: [3040, 0], extent: [3040, 3040] });
  });

  it('lets every lens share a video that covers the whole canvas', async () => {
    const opened = await openInsta360({ primary: memorySource(withMovie(wholeCanvasVideo)) });
    expect(opened.videos).toHaveLength(1);
    expect(opened.images).toEqual([
      { texture: 0, origin: [0, 0], extent: [6080, 3040] },
      { texture: 0, origin: [0, 0], extent: [6080, 3040] },
    ]);
  });

  it('refuses a recording without a video track, in either file', async () => {
    const silent = memorySource(withMovie(noVideo));
    await expect(openInsta360({ primary: silent })).rejects.toThrow(/no video track/);
    await expect(openInsta360({ primary: memorySource(bytes), secondary: silent })).rejects.toThrow(
      /no video track/,
    );
  });
});
