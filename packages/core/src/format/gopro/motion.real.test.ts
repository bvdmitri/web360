import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { MotionSample } from '../../model/recording';
import { ByteReader } from '../../shared/binary/byteReader';
import { findBox, regionOf } from '../mp4/box';
import { readMovie, samplesOf } from '../mp4/movie';
import { readDeviceName, readFrameOrientation, readMotion, type GoproMotion } from './motion';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/gopro/max-eac.360',
);

const MICROS_PER_SECOND = 1_000_000;

const openTelemetry = (): {
  reader: ByteReader;
  samples: ReturnType<typeof samplesOf>;
  timescale: number;
} => {
  const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
  const moov = findBox(reader, regionOf(reader), 'moov');
  if (moov === undefined) throw new Error('the fixture has no moov box');
  const telemetry = readMovie(reader, moov).tracks.find((track) => track.format === 'gpmd');
  if (telemetry === undefined) throw new Error('the fixture has no gpmd track');
  return { reader, samples: samplesOf(telemetry), timescale: telemetry.timescale };
};

const readFixtureMotion = (): GoproMotion => {
  const { reader, samples, timescale } = openTelemetry();
  return readMotion(reader, samples, timescale);
};

const rateHz = (stream: readonly MotionSample[]): number => {
  const first = stream[0]!.timestamp;
  const last = stream.at(-1)!.timestamp;
  return (stream.length - 1) / ((last - first) / MICROS_PER_SECOND);
};

const isStrictlyIncreasing = (stream: readonly MotionSample[]): boolean => {
  for (let index = 1; index < stream.length; index += 1) {
    if (stream[index]!.timestamp <= stream[index - 1]!.timestamp) return false;
  }
  return true;
};

const areAllFinite = (stream: readonly MotionSample[]): boolean =>
  stream.every((sample) => sample.value.every((component) => Number.isFinite(component)));

describe('gopro motion, on a real GoPro MAX .360', () => {
  it('reads a dense gyroscope stream near 800 Hz on a monotonic clock', () => {
    const { angularVelocity } = readFixtureMotion();
    expect(angularVelocity.length).toBeGreaterThan(800);
    expect(isStrictlyIncreasing(angularVelocity)).toBe(true);
    expect(areAllFinite(angularVelocity)).toBe(true);
    expect(angularVelocity[0]!.timestamp).toBeLessThan(MICROS_PER_SECOND);
    expect(rateHz(angularVelocity)).toBeGreaterThan(700);
    expect(rateHz(angularVelocity)).toBeLessThan(1000);
  });

  it('reads the accelerometer at its own, lower rate near 200 Hz', () => {
    const { angularVelocity, acceleration } = readFixtureMotion();
    expect(acceleration.length).toBeLessThan(angularVelocity.length);
    expect(isStrictlyIncreasing(acceleration)).toBe(true);
    expect(areAllFinite(acceleration)).toBe(true);
    expect(rateHz(acceleration)).toBeGreaterThan(150);
    expect(rateHz(acceleration)).toBeLessThan(250);
  });

  it('reads unit camera orientations and gravity at the frame rate, and the camera name', () => {
    const { reader, samples, timescale } = openTelemetry();
    const { camera, image, gravity } = readFrameOrientation(reader, samples, timescale);
    const seconds = (camera.at(-1)!.timestamp - camera[0]!.timestamp) / MICROS_PER_SECOND;
    expect((camera.length - 1) / seconds).toBeGreaterThan(20);
    expect((camera.length - 1) / seconds).toBeLessThan(35);
    expect(image).toHaveLength(camera.length);
    for (const sample of [...camera, ...image].slice(0, 200)) {
      const { w, x, y, z } = sample.orientation;
      expect(Math.hypot(w, x, y, z)).toBeCloseTo(1, 2);
    }
    expect(Math.hypot(...gravity[0]!.value)).toBeCloseTo(1, 1);
    expect(readDeviceName(reader, samples)).toMatch(/max/i);
  });
});
