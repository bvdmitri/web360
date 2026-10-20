// Developer harness, skipped unless WEB360_GOPRO_RATES names a GoPro .360 recording: compares the
// gyro's turn rates with the rates the camera's own attitude (CORI) turns at, frame to frame, and
// fits the small turn, the scale and the lag between them (ADR 0023). Writes OUT.json.
import { statSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readFrameOrientation } from '../format/gopro/motion';
import { openGoPro } from '../format/gopro/open';
import { readMovieFrom } from '../format/mp4/locate';
import { samplesOf } from '../format/mp4/movie';
import type { Sample } from '../format/mp4/timeline';
import type { MotionSample } from '../model/recording';
import type { OrientationSample } from '../motion/orientation';
import type { RandomAccessSource } from '../ports/source';
import { ByteReader } from '../shared/binary/byteReader';
import { conjugate, multiply, type Vector3 } from '../shared/math/quaternion';

const setting = (name: string): string | undefined => process.env[`WEB360_GOPRO_${name}`];
const recording = setting('RATES');
const MICROS = 1_000_000;
const MILLIS = 1000;
// Turns slower than this (rad/s) say little about the axes; skip them.
const SLOWEST = 0.3;

const fileSource = (file: string): RandomAccessSource => ({
  size: statSync(file).size,
  read: (offset, length): Promise<Uint8Array> => {
    const handle = openSync(file, 'r');
    const bytes = new Uint8Array(length);
    readSync(handle, bytes, 0, length, offset);
    closeSync(handle);
    return Promise.resolve(bytes);
  },
});

// The camera's own attitude (CORI), read as the body's turn to the world, on the telemetry clock.
const cameraAttitude = async (source: RandomAccessSource): Promise<OrientationSample[]> => {
  const movie = await readMovieFrom(source);
  const track = movie.tracks.find((one) => one.format === 'gpmd');
  if (track === undefined) return [];
  const original = samplesOf(track);
  const bytes = new Uint8Array(original.reduce((sum, sample) => sum + sample.size, 0));
  const samples: Sample[] = [];
  let offset = 0;
  for (const sample of original) {
    bytes.set(await source.read(sample.offset, sample.size), offset);
    samples.push({ ...sample, offset });
    offset += sample.size;
  }
  return readFrameOrientation(ByteReader.of(bytes), samples, track.timescale).camera.map(
    (sample) => ({ ...sample, orientation: conjugate(sample.orientation) }),
  );
};

const rotationVector = (q: { w: number; x: number; y: number; z: number }): Vector3 => {
  const sign = q.w < 0 ? -1 : 1;
  const [w, x, y, z] = [q.w * sign, q.x * sign, q.y * sign, q.z * sign];
  const half = Math.hypot(x, y, z);
  if (half === 0) return [0, 0, 0];
  const angle = 2 * Math.atan2(half, w);
  return [(x / half) * angle, (y / half) * angle, (z / half) * angle];
};

const DEGREES = 180 / Math.PI;
const LAGS = [-30, -20, -10, -5, 0, 5, 10, 15, 20, 30];
// The fit's unknowns: the scale, and the scale times each component of the small turn.
const UNKNOWNS = 4;

interface RatePair {
  readonly g: Vector3;
  readonly c: Vector3;
}

const add = (sum: [number, number, number], value: readonly number[]): void => {
  sum[0] += value[0] ?? 0;
  sum[1] += value[1] ?? 0;
  sum[2] += value[2] ?? 0;
};

// The mean gyro rate over [from, to), and where the next window may start looking.
const meanRate = (
  gyro: readonly MotionSample[],
  window: { from: number; to: number; start: number },
): { rate: Vector3; next: number } => {
  let index = window.start;
  while (index < gyro.length && gyro[index]!.timestamp < window.from) index += 1;
  const next = index;
  const sum: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (; index < gyro.length && gyro[index]!.timestamp < window.to; index += 1) {
    add(sum, gyro[index]!.value);
    count += 1;
  }
  const rate: Vector3 = count === 0 ? [0, 0, 0] : [sum[0] / count, sum[1] / count, sum[2] / count];
  return { rate, next };
};

// CORI's turn rate over each frame, with the gyro's mean rate over the same frame shifted by lag.
const ratePairs = (
  attitude: readonly OrientationSample[],
  gyro: readonly MotionSample[],
  lag: number,
): RatePair[] => {
  const pairs: RatePair[] = [];
  let start = 0;
  for (let index = 1; index < attitude.length; index += 1) {
    const [a, b] = [attitude[index - 1]!, attitude[index]!];
    const dt = (b.timestamp - a.timestamp) / MICROS;
    const turn = rotationVector(multiply(conjugate(a.orientation), b.orientation));
    const window = { from: a.timestamp + lag * MILLIS, to: b.timestamp + lag * MILLIS, start };
    const { rate, next } = meanRate(gyro, window);
    start = next;
    if (Math.hypot(...rate) > SLOWEST)
      pairs.push({ g: rate, c: [turn[0] / dt, turn[1] / dt, turn[2] / dt] });
  }
  return pairs;
};

// Solves the augmented normal equations in place by Gauss-Jordan elimination.
const solve = (normal: number[][]): number[] => {
  for (let pivot = 0; pivot < UNKNOWNS; pivot += 1) {
    const lead = normal[pivot]!;
    const scale = lead[pivot]!;
    for (let column = 0; column <= UNKNOWNS; column += 1) lead[column]! /= scale;
    for (const [other, row] of normal.entries()) {
      if (other !== pivot) eliminate(row, lead, pivot);
    }
  }
  return normal.map((row) => row[UNKNOWNS]!);
};

const eliminate = (row: number[], lead: readonly number[], pivot: number): void => {
  const factor = row[pivot]!;
  for (let column = 0; column <= UNKNOWNS; column += 1) row[column]! -= factor * lead[column]!;
};

// Least squares for c ~ s (g + t x g): the scale s and the small turn t (radians) from gyro to CORI.
const fitTurnAndScale = (pairs: readonly RatePair[]): { scale: number; turn: Vector3 } => {
  // Unknowns s and u = s t: c = s g + u x g = s g - [g]x u, each pair three rows.
  const normal = Array.from({ length: UNKNOWNS }, () => [0, 0, 0, 0, 0]);
  for (const { g, c } of pairs) {
    const rows = [
      [g[0], 0, g[2], -g[1], c[0]],
      [g[1], -g[2], 0, g[0], c[1]],
      [g[2], g[1], -g[0], 0, c[2]],
    ];
    for (const row of rows) accumulate(normal, row);
  }
  const [scale = 1, ux = 0, uy = 0, uz = 0] = solve(normal);
  return { scale, turn: [ux / scale, uy / scale, uz / scale] };
};

const accumulate = (normal: number[][], row: readonly number[]): void => {
  for (const [index, line] of normal.entries()) {
    for (let column = 0; column <= UNKNOWNS; column += 1)
      line[column]! += row[index]! * row[column]!;
  }
};

// The root mean square mismatch of the fit, in rad/s.
const residualOf = (pairs: readonly RatePair[], fit: { scale: number; turn: Vector3 }): number => {
  let total = 0;
  for (const { g, c } of pairs) {
    const t = fit.turn;
    const cross = [t[1] * g[2] - t[2] * g[1], t[2] * g[0] - t[0] * g[2], t[0] * g[1] - t[1] * g[0]];
    for (const axis of [0, 1, 2]) total += (fit.scale * (g[axis]! + cross[axis]!) - c[axis]!) ** 2;
  }
  return Math.sqrt(total / pairs.length);
};

describe('gopro rates (developer harness)', () => {
  it.skipIf(recording === undefined)(
    'fits the turn, scale and lag between the gyro and the camera attitude',
    async () => {
      const source = fileSource(recording ?? '');
      const { recording: camera } = await openGoPro([source]);
      const attitude = await cameraAttitude(source);
      // The reader already puts the gyro on the orientation frame's axes, which CORI is on.
      const gyro = camera.angularVelocity;
      const span = (gyro.at(-1)?.timestamp ?? 1) - (gyro[0]?.timestamp ?? 0);
      const results: Record<string, unknown> = { gyroRate: (gyro.length * MICROS) / span };
      for (const lag of LAGS) {
        const pairs = ratePairs(attitude, gyro, lag);
        const fit = fitTurnAndScale(pairs);
        results[`lag ${lag} ms`] = {
          pairs: pairs.length,
          scale: fit.scale,
          turnDegrees: fit.turn.map((value) => value * DEGREES),
          residualDegreesPerSecond: residualOf(pairs, fit) * DEGREES,
        };
      }
      const out = setting('OUT') ?? path.join(os.tmpdir(), 'web360-gopro-rates');
      writeFileSync(`${out}.json`, JSON.stringify(results, undefined, 2));
      expect(results).toBeDefined();
    },
    600_000,
  );
});
