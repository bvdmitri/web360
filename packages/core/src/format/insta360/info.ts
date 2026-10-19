import type { ByteReader } from '../../shared/binary/byteReader';
import type { Region } from '../mp4/box';
import { byNumber, doubleOf, scanMessage, stringOf, submessageOf, varintOf } from './protobuf';

const MODEL = 2;
const CALIBRATION = 5;
const DIMENSION = 19;
const FRAME_RATE = 20;
const FIRST_FRAME = 24;
const ROLLING_SHUTTER = 25;
const GYRO_OFFSET = 28;
const GYRO_OFFSET_FLAG = 29;
const RAW_GYRO = 62;
const GYRO_CONFIG = 65;
const WIDTH = 1;
const HEIGHT = 2;
const ACCEL_RANGE = 1;
const GYRO_RANGE = 2;

/**
 * The info record (id 1) of an Insta360 trailer: the recording's identity, size, timing and
 * calibration.
 *
 * @remarks `firstFrameTimestamp` shares the recording's capture clock, counted in the gyro unit,
 * which is microseconds when `rawGyro` is set and milliseconds otherwise. `rollingShutterMs` and
 * `gyroOffsetMs` are milliseconds. `calibration` is the raw lens-calibration string (the version
 * is its first token's count); parsing it into lens poses is separate. The gyro ranges scale the
 * gyro record's samples.
 */
export interface InfoRecord {
  readonly model: string;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly firstFrameTimestamp: number;
  readonly rollingShutterMs: number;
  readonly gyroOffsetMs: number;
  readonly hasGyroOffset: boolean;
  readonly rawGyro: boolean;
  readonly accelerometerRange: number;
  readonly gyroscopeRange: number;
  readonly calibration: string;
}

/** Reads the info record's protobuf message into an {@link InfoRecord}. */
export function readInfo(reader: ByteReader, region: Region): InfoRecord {
  const fields = byNumber(scanMessage(reader, region));
  const dimension = submessageOf(reader, fields, DIMENSION);
  const gyro = submessageOf(reader, fields, GYRO_CONFIG);
  return {
    model: stringOf(reader, fields, MODEL),
    width: varintOf(dimension, WIDTH),
    height: varintOf(dimension, HEIGHT),
    frameRate: varintOf(fields, FRAME_RATE),
    firstFrameTimestamp: varintOf(fields, FIRST_FRAME),
    rollingShutterMs: doubleOf(reader, fields, ROLLING_SHUTTER),
    gyroOffsetMs: doubleOf(reader, fields, GYRO_OFFSET),
    hasGyroOffset: varintOf(fields, GYRO_OFFSET_FLAG) !== 0,
    rawGyro: varintOf(fields, RAW_GYRO) !== 0,
    accelerometerRange: varintOf(gyro, ACCEL_RANGE),
    gyroscopeRange: varintOf(gyro, GYRO_RANGE),
    calibration: stringOf(reader, fields, CALIBRATION),
  };
}
