import type { CameraRecording, LensOptics } from '../../model/recording';
import type { ByteReader } from '../../shared/binary/byteReader';
import { microseconds, seconds } from '../../shared/units/units';
import type { Region } from '../mp4/box';
import { readCalibration, type LensPose } from './calibration';
import { readExposure } from './exposure';
import { readGyro } from './gyro';
import { readInfo } from './info';
import { readTrailer, type TrailerRecord } from './trailer';

const INFO = 1;
const GYRO = 3;
const EXPOSURE = 4;
const MS_PER_SECOND = 1000;

/**
 * Reads an Insta360 recording into the vendor-neutral {@link CameraRecording}.
 *
 * @remarks The reader is the file that carries the trailer (the `_00_` half of a split recording).
 * The info, gyro, exposure and calibration records become the model's metadata, motion, timing and
 * optics. The frames themselves, and a split recording's second lens file, are read elsewhere;
 * this is the telemetry, optics and timing.
 */
export function readInsta360Recording(reader: ByteReader): CameraRecording {
  const records = readTrailer(reader).records;
  const info = readInfo(reader, regionById(records, INFO));
  const ranges = { accelerometer: info.accelerometerRange, gyroscope: info.gyroscopeRange };
  return {
    model: info.model,
    frameRate: info.frameRate,
    frame: { width: info.width, height: info.height },
    lenses: readCalibration(info.calibration).lenses.map((pose) => toOptics(pose)),
    motion: readGyro(reader, regionById(records, GYRO), ranges),
    exposures: readExposure(reader, regionById(records, EXPOSURE)),
    rollingShutter: seconds(info.rollingShutterMs / MS_PER_SECOND),
    captureClock: microseconds(info.firstFrameTimestamp),
  };
}

function regionById(records: readonly TrailerRecord[], id: number): Region {
  const record = records.find((candidate) => candidate.id === id);
  if (record === undefined) throw new Error(`the recording has no record ${id}`);
  return record.region;
}

function toOptics(pose: LensPose): LensOptics {
  return {
    projection: 'equidistant',
    radius: pose.radius,
    center: pose.center,
    orientation: { yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll },
  };
}
