import type { MotionSample } from '../../model/recording';
import type { OrientationSample } from '../../motion/orientation';
import { normalize } from '../../shared/math/quaternion';
import type { ByteReader } from '../../shared/binary/byteReader';
import { microseconds } from '../../shared/units/units';
import type { Sample } from '../mp4/timeline';
import { childrenOf, klvNodes, type KlvNode } from './gpmf';
import { orient } from './axes';
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
  const stream = readStream(reader, strm);
  const step = window.span / stream.samples.length;
  return stream.samples.map((row, index) => ({
    timestamp: microseconds(window.start + index * step),
    value: orient(toVector(row), stream.orientation),
  }));
}

/**
 * A GoPro recording's per-frame orientation as the camera reports it: its own attitude (`CORI`),
 * the turn it applied to the image relative to the body (`IORI`), and the gravity direction
 * (`GRAV`), each on the media clock.
 */
export interface GoproOrientation {
  readonly camera: OrientationSample[];
  readonly image: OrientationSample[];
  readonly gravity: MotionSample[];
}

/**
 * Reads the per-frame orientation streams a GoPro writes beside its sensors.
 *
 * @remarks `CORI` and `IORI` are unit quaternions stored as signed 16-bit `w, x, y, z` over their
 * `SCAL` (32767), one per video frame; `GRAV` is a unit vector likewise. Each block's samples are
 * spaced over the block's duration from its decode time, as {@link readMotion} spaces the sensors.
 * The quaternions are renormalised against the rounding of their 16-bit storage. A recording
 * without these streams (an older body) reads as empty lists.
 */
export function readFrameOrientation(
  reader: ByteReader,
  samples: readonly Sample[],
  timescale: number,
): GoproOrientation {
  const out: GoproOrientation = { camera: [], image: [], gravity: [] };
  for (const sample of samples) {
    const window = {
      start: toMicros(sample.decodeTime, timescale),
      span: toMicros(sample.duration, timescale),
    };
    const streams = streamsOf(reader, sample);
    out.camera.push(...quaternions(reader, streamFor(reader, streams, 'CORI'), window));
    out.image.push(...quaternions(reader, streamFor(reader, streams, 'IORI'), window));
    out.gravity.push(...collect(reader, streamFor(reader, streams, 'GRAV'), window));
  }
  return out;
}

/** The camera's name (`DVNM`) from the first telemetry block that states it, or `''`. */
export function readDeviceName(reader: ByteReader, samples: readonly Sample[]): string {
  for (const sample of samples) {
    const region = { start: sample.offset, end: sample.offset + sample.size };
    const name = klvNodes(reader, region)
      .flatMap((node) => childrenOf(reader, node))
      .find((node) => node.key === 'DVNM');
    if (name !== undefined) {
      return reader
        .ascii(name.region.start, name.region.end - name.region.start)
        .replaceAll('\u{0000}', '');
    }
  }
  return '';
}

function quaternions(
  reader: ByteReader,
  strm: KlvNode | undefined,
  window: Window,
): OrientationSample[] {
  if (strm === undefined) return [];
  const rows = readStream(reader, strm).samples;
  const step = window.span / rows.length;
  return rows.map((row, index) => {
    const [w = 1, x = 0, y = 0, z = 0] = row;
    return {
      timestamp: microseconds(window.start + index * step),
      orientation: normalize({ w, x, y, z }),
    };
  });
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
