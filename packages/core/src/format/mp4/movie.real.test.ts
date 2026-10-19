import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from './box';
import { readMovie } from './movie';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('mp4 movie, on a real Insta360 ONE R recording', () => {
  it('reads the movie, its three tracks and the video sample entry', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const moov = findBox(reader, regionOf(reader), 'moov');
    if (moov === undefined) throw new Error('the fixture has no moov box');

    const movie = readMovie(reader, moov);
    expect(movie.tracks).toHaveLength(3);

    const video = movie.tracks.find((track) => track.handler === 'vide');
    if (video === undefined) throw new Error('the fixture has no video track');
    expect(video.sampleEntry).toMatchObject({ format: 'avc1', width: 2880, height: 2880 });
    expect(video.samples).toHaveLength(4299);

    expect(movie.tracks.some((track) => track.handler === 'soun')).toBe(true);
  });
});
