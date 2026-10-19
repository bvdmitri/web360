import type { CameraRecording, LensOptics } from '../../model/recording';
import type { ByteReader } from '../../shared/binary/byteReader';
import { fromRotationVector } from '../../shared/math/quaternion';
import { degrees, microseconds, seconds } from '../../shared/units/units';
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

// The v1 calibration carries neither angle, so the reader supplies them per camera model (ADR 0007).
// For the ONE R: the mapping reaches the calibration radius at 183 degrees, the value at which the
// two lenses register best across the seam on far-field (freefall) footage; and the image is
// trusted out to 188 degrees, where the 2880-pixel frame crops the illuminated circle (about 1.03
// times the radius).
const FIELD_OF_VIEW_DEGREES = 183;
const COVERAGE_DEGREES = 188;
const FIELD_OF_VIEW = degrees(FIELD_OF_VIEW_DEGREES);
const COVERAGE = degrees(COVERAGE_DEGREES);

// The ONE R's IMU axes sit a quarter turn about X from the lens calibration frame (IMU z along the
// lens frame's y), measured on the owner's footage: of the 24 axis-aligned candidates it is the one
// that keeps a world-locked view stillest through fast canopy turns (ADR 0010).
const IMU_TO_CAMERA = fromRotationVector([-Math.PI / 2, 0, 0]);

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
  const imu = readGyro(reader, regionById(records, GYRO), ranges);
  return {
    model: info.model,
    frameRate: info.frameRate,
    frame: { width: info.width, height: info.height },
    lenses: readCalibration(info.calibration).lenses.map((pose) => toOptics(pose)),
    angularVelocity: imu.angularVelocity,
    acceleration: imu.acceleration,
    imuToCamera: IMU_TO_CAMERA,
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
    fieldOfView: FIELD_OF_VIEW,
    coverage: COVERAGE,
    center: pose.center,
    orientation: { yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll },
  };
}
