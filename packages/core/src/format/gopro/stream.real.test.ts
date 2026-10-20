import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from '../mp4/box';
import { readMovie, samplesOf } from '../mp4/movie';
import { childrenOf, klvNodes, type KlvNode } from './gpmf';
import { readStream, type GpmfStream } from './stream';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/gopro/max2-eac.360',
);

const streamByLeaf = (leafKey: string): GpmfStream => {
  const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
  const moov = findBox(reader, regionOf(reader), 'moov');
  if (moov === undefined) throw new Error('the fixture has no moov box');
  const telemetry = readMovie(reader, moov).tracks.find((track) => track.format === 'gpmd');
  if (telemetry === undefined) throw new Error('the fixture has no gpmd track');
  const [sample] = samplesOf(telemetry);
  if (sample === undefined) throw new Error('the gpmd track has no sample');

  const devc = klvNodes(reader, { start: sample.offset, end: sample.offset + sample.size }).find(
    (node) => node.key === 'DEVC',
  );
  if (devc === undefined) throw new Error('the first telemetry sample has no DEVC');
  const stream = childrenOf(reader, devc).find((strm) => lastChildKey(reader, strm) === leafKey);
  if (stream === undefined) throw new Error(`no ${leafKey} stream`);
  return readStream(reader, stream);
};

const lastChildKey = (reader: ByteReader, strm: KlvNode): string | undefined =>
  childrenOf(reader, strm).at(-1)?.key;

const hasFiniteTriples = (stream: GpmfStream): boolean =>
  stream.samples.every((row) => row.length === 3 && row.every((value) => Number.isFinite(value)));

describe('gpmf stream, on a real GoPro MAX .360', () => {
  it('decodes the gyroscope stream to radians per second', () => {
    const gyro = streamByLeaf('GYRO');
    expect(gyro).toMatchObject({ name: 'Gyroscope', unit: 'rad/s', orientation: 'ZXY' });
    expect(gyro.startTime).toBeGreaterThan(0);
    expect(gyro.samples).toHaveLength(802);
    expect(hasFiniteTriples(gyro)).toBe(true);
    expect(gyro.samples.some((row) => row.some((value) => value !== 0))).toBe(true);
  });

  it('decodes the accelerometer stream at its own, lower rate', () => {
    const accel = streamByLeaf('ACCL');
    expect(accel.name).toBe('Accelerometer');
    expect(accel.unit.startsWith('m/s')).toBe(true);
    expect(accel.samples).toHaveLength(200);
    expect(hasFiniteTriples(accel)).toBe(true);
    expect(accel.samples.some((row) => row.some((value) => value !== 0))).toBe(true);
  });
});
