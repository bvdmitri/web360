import type { MotionSample } from '../../model/recording';
import type { ByteReader } from '../../shared/binary/byteReader';
import { degrees, degreesToRadians, microseconds } from '../../shared/units/units';
import type { Region } from '../mp4/box';

const SAMPLE_SIZE = 20;
const ACCEL_OFFSET = 8;
const GYRO_OFFSET = 14;
const COMPONENT_SIZE = 2;
const OFFSET_BINARY_MID = 32_768;
const GRAVITY = 9.80665;

/** The accelerometer and gyroscope full-scale ranges, from the info record. */
export interface GyroRanges {
  readonly accelerometer: number;
  readonly gyroscope: number;
}

/** The angular-velocity (rad/s) and acceleration (m/s^2) streams split from one fused record. */
export interface ImuStreams {
  readonly angularVelocity: MotionSample[];
  readonly acceleration: MotionSample[];
}

/**
 * Reads the raw-layout gyro record (id 3) into the angular-velocity and acceleration streams.
 *
 * @remarks Each 20-byte sample is a `u64` microsecond timestamp, then three accelerometer and
 * three gyroscope components, each an offset-binary `u16` around 32768 scaled by its full-scale
 * range. The record fuses both sensors on one timestamp, so the two streams it yields share their
 * timestamps. Acceleration converts from g to m/s^2; angular velocity from degrees per second to
 * radians per second. This is the raw layout the X-series and ONE R write; the older float layout
 * is not read here.
 */
export function readGyro(reader: ByteReader, region: Region, ranges: GyroRanges): ImuStreams {
  const count = Math.floor((region.end - region.start) / SAMPLE_SIZE);
  const angularVelocity: MotionSample[] = [];
  const acceleration: MotionSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = region.start + index * SAMPLE_SIZE;
    const timestamp = microseconds(reader.u64le(at));
    acceleration.push({
      timestamp,
      value: metric(triple(reader, at + ACCEL_OFFSET, ranges.accelerometer)),
    });
    angularVelocity.push({
      timestamp,
      value: angular(triple(reader, at + GYRO_OFFSET, ranges.gyroscope)),
    });
  }
  return { angularVelocity, acceleration };
}

function metric(inG: readonly [number, number, number]): [number, number, number] {
  return [inG[0] * GRAVITY, inG[1] * GRAVITY, inG[2] * GRAVITY];
}

function triple(reader: ByteReader, at: number, range: number): [number, number, number] {
  return [
    scaled(reader, at, range),
    scaled(reader, at + COMPONENT_SIZE, range),
    scaled(reader, at + COMPONENT_SIZE * 2, range),
  ];
}

function scaled(reader: ByteReader, at: number, range: number): number {
  return ((reader.u16le(at) - OFFSET_BINARY_MID) / OFFSET_BINARY_MID) * range;
}

function angular(perSecond: readonly [number, number, number]): [number, number, number] {
  return [
    degreesToRadians(degrees(perSecond[0])),
    degreesToRadians(degrees(perSecond[1])),
    degreesToRadians(degrees(perSecond[2])),
  ];
}
