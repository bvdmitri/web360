import type { MotionSample } from '../../model/recording';
import type { ByteReader } from '../../shared/binary/byteReader';
import { degrees, degreesToRadians, microseconds } from '../../shared/units/units';
import type { Region } from '../mp4/box';

const SAMPLE_SIZE = 20;
const ACCEL_OFFSET = 8;
const GYRO_OFFSET = 14;
const COMPONENT_SIZE = 2;
const OFFSET_BINARY_MID = 32_768;

/** The accelerometer and gyroscope full-scale ranges, from the info record. */
export interface GyroRanges {
  readonly accelerometer: number;
  readonly gyroscope: number;
}

/**
 * Reads the raw-layout gyro record (id 3) into IMU motion samples.
 *
 * @remarks Each 20-byte sample is a `u64` microsecond timestamp, then three accelerometer and
 * three gyroscope components, each an offset-binary `u16` around 32768 scaled by its full-scale
 * range. Acceleration stays in g; angular velocity converts from degrees per second to radians
 * per second. This is the raw layout the X-series and ONE R write; the older float layout is not
 * read here.
 */
export function readGyro(reader: ByteReader, region: Region, ranges: GyroRanges): MotionSample[] {
  const count = Math.floor((region.end - region.start) / SAMPLE_SIZE);
  const samples: MotionSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = region.start + index * SAMPLE_SIZE;
    samples.push({
      timestamp: microseconds(reader.u64le(at)),
      acceleration: triple(reader, at + ACCEL_OFFSET, ranges.accelerometer),
      angularVelocity: angular(triple(reader, at + GYRO_OFFSET, ranges.gyroscope)),
    });
  }
  return samples;
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
