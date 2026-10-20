import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from '../mp4/box';
import { readMovie, samplesOf } from '../mp4/movie';
import { childrenOf, klvNodes, type KlvNode } from './gpmf';

const INT16 = 0x73;
const GYRO_STRUCT_SIZE = 6;

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/gopro/max2-eac.360',
);

const open = (): { reader: ByteReader; leaves: KlvNode[] } => {
  const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
  const moov = findBox(reader, regionOf(reader), 'moov');
  if (moov === undefined) throw new Error('the fixture has no moov box');

  const telemetry = readMovie(reader, moov).tracks.find((track) => track.format === 'gpmd');
  if (telemetry === undefined) throw new Error('the fixture has no gpmd track');
  const [sample] = samplesOf(telemetry);
  if (sample === undefined) throw new Error('the gpmd track has no sample');

  const region = { start: sample.offset, end: sample.offset + sample.size };
  const devc = klvNodes(reader, region).find((node) => node.key === 'DEVC');
  if (devc === undefined) throw new Error('the first telemetry sample has no DEVC');
  const leaves = childrenOf(reader, devc).flatMap((stream) => childrenOf(reader, stream));
  return { reader, leaves };
};

const bytesOf = (reader: ByteReader, node: KlvNode): Uint8Array =>
  reader.bytes(node.region.start, node.region.end - node.region.start);

describe('gpmf, on a real GoPro MAX .360', () => {
  it('finds a populated gyroscope stream in the first telemetry sample', () => {
    const { reader, leaves } = open();
    const gyro = leaves.find((node) => node.key === 'GYRO');
    if (gyro === undefined) throw new Error('no GYRO leaf');
    expect(gyro.type).toBe(INT16);
    expect(gyro.structSize).toBe(GYRO_STRUCT_SIZE);
    expect(gyro.count).toBeGreaterThan(0);
    expect(bytesOf(reader, gyro).some((byte) => byte !== 0)).toBe(true);
  });

  it('carries a GPS stream that the fixture has scrubbed to zero', () => {
    const { reader, leaves } = open();
    const gps = leaves.find((node) => node.key === 'GPS9');
    if (gps === undefined) throw new Error('no GPS9 leaf');
    expect(gps.count).toBeGreaterThan(0);
    expect(bytesOf(reader, gps).every((byte) => byte === 0)).toBe(true);
  });
});
