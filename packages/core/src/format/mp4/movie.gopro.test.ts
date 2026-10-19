import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from './box';
import { readMovie, samplesOf } from './movie';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/gopro/max-eac.360',
);

describe('mp4 movie, on a real GoPro MAX .360', () => {
  it('reads every track and expands only the one asked for', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const moov = findBox(reader, regionOf(reader), 'moov');
    if (moov === undefined) throw new Error('the fixture has no moov box');

    const movie = readMovie(reader, moov);
    expect(movie.tracks).toHaveLength(6);

    const video = movie.tracks.filter((track) => track.handler === 'vide');
    expect(video).toHaveLength(2);
    const first = video[0];
    if (first === undefined) throw new Error('no video track');
    expect(first.sampleEntry).toMatchObject({ format: 'hvc1', width: 5888, height: 1920 });
    expect(samplesOf(first)).toHaveLength(6682);
  });
});
