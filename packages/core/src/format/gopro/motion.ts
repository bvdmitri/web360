import type { MotionSample } from '../../model/recording';
import type { ByteReader } from '../../shared/binary/byteReader';
import { microseconds } from '../../shared/units/units';
import type { Sample } from '../mp4/timeline';
import { childrenOf, klvNodes, type KlvNode } from './gpmf';
import { readStream, UnsupportedStreamError } from './stream';

const MICROS_PER_SECOND = 1_000_000;

/** A GoPro recording's angular-velocity (rad/s) and acceleration (m/s^2) streams on the media clock. */
export interface GoproMotion {
  readonly angularVelocity: MotionSample[];
  readonly acceleration: MotionSample[];
}

interface Window {
  readonly start: number;
  readonly span: number;
}

/**
 * Reads a GoPro telemetry track's samples into the angular-velocity and acceleration streams.
 *
 * @remarks `samples` are the telemetry (`gpmd`) track's samples and `timescale` its media clock.
 * Each sample is one GPMF payload (a `DEVC` block) carrying a second or so of sensor data; its
 * `GYRO` and `ACCL` streams run at their own rates, so they become two independent lists. A
 * payload's samples are spaced evenly across the sample's own duration, starting at its decode
 * time, both converted to microseconds on the media clock. A payload missing a stream contributes
 * nothing to it rather than failing the read.
 *
 * @see {@link readStream}
 */
export function readMotion(
  reader: ByteReader,
  samples: readonly Sample[],
  timescale: number,
): GoproMotion {
  const angularVelocity: MotionSample[] = [];
  const acceleration: MotionSample[] = [];
  for (const sample of samples) {
    const window = {
      start: toMicros(sample.decodeTime, timescale),
      span: toMicros(sample.duration, timescale),
    };
    const streams = streamsOf(reader, sample);
    angularVelocity.push(...collect(reader, streamFor(reader, streams, 'GYRO'), window));
    acceleration.push(...collect(reader, streamFor(reader, streams, 'ACCL'), window));
  }
  return { angularVelocity, acceleration };
}

function collect(reader: ByteReader, strm: KlvNode | undefined, window: Window): MotionSample[] {
  if (strm === undefined) return [];
  const rows = readStream(reader, strm).samples;
  const step = window.span / rows.length;
  return rows.map((row, index) => ({
    timestamp: microseconds(window.start + index * step),
    value: toVector(row),
  }));
}

function streamsOf(reader: ByteReader, sample: Sample): KlvNode[] {
  const region = { start: sample.offset, end: sample.offset + sample.size };
  return klvNodes(reader, region)
    .flatMap((node) => childrenOf(reader, node))
    .filter((node) => node.key === 'STRM');
}

function streamFor(reader: ByteReader, streams: KlvNode[], leafKey: string): KlvNode | undefined {
  return streams.find((strm) => childrenOf(reader, strm).at(-1)?.key === leafKey);
}

function toVector(row: readonly number[]): [number, number, number] {
  const [x, y, z] = row;
  if (x === undefined || y === undefined || z === undefined) {
    throw new UnsupportedStreamError('a motion sample is not a 3-vector');
  }
  return [x, y, z];
}

function toMicros(ticks: number, timescale: number): number {
  return (ticks / timescale) * MICROS_PER_SECOND;
}
