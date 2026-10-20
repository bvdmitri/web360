import type { CameraRecording, MotionSample } from '../../model/recording';
import type { EncodedVideo, OpenedRecording } from '../../model/video';
import type { RandomAccessSource } from '../../ports/source';
import { ByteReader } from '../../shared/binary/byteReader';
import { rotate, type Quaternion } from '../../shared/math/quaternion';
import { microseconds, seconds } from '../../shared/units/units';
import { encodedVideosOf } from '../mp4/frames';
import { readMovieFrom } from '../mp4/locate';
import { samplesOf, type Track } from '../mp4/movie';
import type { Sample } from '../mp4/timeline';
import { goproCubeMap } from './cube';
import { readDeviceName, readFrameOrientation, readMotion } from './motion';

const MICROS_PER_SECOND = 1_000_000;
const TELEMETRY = 'gpmd';
const TRACKS = 2;

// The camera's orientation frame (CORI, GRAV) is x right, y down, z forward; the cube's is x
// forward, y left, z up. Found on MAX2 footage by locking a fast-turning view to the world with
// each of the 24 axis-aligned rotations: this one held it stillest by far (ADR 0021).
const ORIENTATION_TO_CUBE: Quaternion = { w: 0.5, x: -0.5, y: 0.5, z: -0.5 };
// The gyro and accelerometer axes (after ORIN) onto the orientation frame's: a half turn taking x, y,
// z to -x, -z, -y. Found on MAX2 footage: the accelerometer agrees with GRAV on this turn alone, and
// the gyro then matches CORI's turn rates to a scale of 1.000 and a twentieth of a degree (ADR 0023).
const IMU_TO_ORIENTATION: Quaternion = { w: 0, x: 0, y: Math.SQRT1_2, z: -Math.SQRT1_2 };
// The gyro runs this far behind the picture: on MAX2 footage the picture shook least from frame to
// frame with each frame steered by the gyro 10 ms after it (ADR 0023).
const CAPTURE_DELAY = 10_000;
const CAPTURE_CLOCK = microseconds(CAPTURE_DELAY);

/** Files that are not a GoPro 360 recording: no telemetry track, or not two cube-map tracks. */
export class NotGoProError extends Error {
  public override readonly name = 'NotGoProError';
}

/** An opened GoPro recording and the chapter files its frames are read from. */
export interface GoProOpened extends OpenedRecording {
  readonly sources: readonly RandomAccessSource[];
}

type VideoPair = readonly [EncodedVideo, EncodedVideo];

// One chapter file, and where its frames start in the joined recording.
interface Chapter {
  readonly start: number;
  readonly videos: VideoPair;
  readonly telemetry: {
    readonly reader: ByteReader;
    readonly samples: Sample[];
    readonly timescale: number;
  };
}

/**
 * Opens a GoPro MAX or MAX2 recording from its chapter files, in order, reading their movies and
 * telemetry but no picture.
 *
 * @remarks A long recording is split into chapters (`GS01nnnn.360`, `GS02nnnn.360`, ...); they are
 * joined into one recording, each chapter's frames and motion shifted by the length of the chapters
 * before it, and every frame naming the chapter it is in. The picture is the equi-angular cube map
 * across the two video tracks (ADR 0020); the motion is the gyro and accelerometer, turned onto the
 * camera's orientation frame, with the camera's gravity as the up direction (`GRAV` negated) on the
 * same axes, which `imuToCamera` turns onto the cube's (ADR 0021, ADR 0023). Throws
 * {@link NotGoProError} for files without a telemetry track or two video tracks.
 */
export async function openGoPro(chapters: readonly RandomAccessSource[]): Promise<GoProOpened> {
  const [head, ...tail] = chapters;
  if (head === undefined) throw new NotGoProError('no files to open');
  const first = await readChapter(head, 0);
  const read: [Chapter, ...Chapter[]] = [first];
  let previous = first;
  for (const source of tail) {
    previous = await readChapter(source, previous.start + durationOf(previous.videos[0]));
    read.push(previous);
  }
  const videos = joinVideos(read);
  const [video] = videos;
  const duration = durationOf(video);
  return {
    recording: recordingOf(read, { video, duration }),
    canvas: [video.width, video.height],
    videos,
    images: [],
    cube: goproCubeMap(video),
    duration: seconds(duration / MICROS_PER_SECOND),
    sources: chapters,
  };
}

async function readChapter(source: RandomAccessSource, start: number): Promise<Chapter> {
  const movie = await readMovieFrom(source);
  const videos = encodedVideosOf(movie.tracks);
  const telemetry = movie.tracks.find((track) => track.format === TELEMETRY);
  if (telemetry === undefined || videos.length !== TRACKS) {
    throw new NotGoProError(
      'not a GoPro 360 recording: no telemetry track or not two video tracks',
    );
  }
  return {
    start,
    videos: videos as unknown as VideoPair,
    telemetry: await readTelemetry(source, telemetry),
  };
}

// The telemetry samples' bytes gathered into one buffer, with the samples pointing into it.
async function readTelemetry(
  source: RandomAccessSource,
  track: Track,
): Promise<Chapter['telemetry']> {
  const original = samplesOf(track);
  const total = original.reduce((sum, sample) => sum + sample.size, 0);
  const bytes = new Uint8Array(total);
  const samples: Sample[] = [];
  let offset = 0;
  for (const sample of original) {
    bytes.set(await source.read(sample.offset, sample.size), offset);
    samples.push({ ...sample, offset });
    offset += sample.size;
  }
  return { reader: ByteReader.of(bytes), samples, timescale: track.timescale };
}

function joinVideos(chapters: readonly [Chapter, ...Chapter[]]): VideoPair {
  const [first] = chapters;
  const join = (track: 0 | 1): EncodedVideo => ({
    ...first.videos[track],
    frames: chapters.flatMap((chapter, source) =>
      chapter.videos[track].frames.map((frame) => ({
        ...frame,
        source,
        timestamp: microseconds(frame.timestamp + chapter.start),
      })),
    ),
  });
  return [join(0), join(1)];
}

function recordingOf(
  chapters: readonly [Chapter, ...Chapter[]],
  joined: { readonly video: EncodedVideo; readonly duration: number },
): CameraRecording {
  const motion = chapters.map((chapter) => motionOf(chapter));
  const { telemetry } = chapters[0];
  return {
    model: readDeviceName(telemetry.reader, telemetry.samples),
    frameRate: (joined.video.frames.length * MICROS_PER_SECOND) / joined.duration,
    frame: { width: joined.video.width, height: joined.video.height },
    lenses: [],
    angularVelocity: motion.flatMap((one) => one.angularVelocity),
    acceleration: motion.flatMap((one) => one.acceleration),
    imuToCamera: ORIENTATION_TO_CUBE,
    exposures: [],
    rollingShutter: seconds(0),
    captureClock: CAPTURE_CLOCK,
    gravity: motion.flatMap((one) => one.gravity),
  };
}

interface ChapterMotion {
  readonly angularVelocity: MotionSample[];
  readonly acceleration: MotionSample[];
  readonly gravity: MotionSample[];
}

function motionOf(chapter: Chapter): ChapterMotion {
  const { start } = chapter;
  const { reader, samples, timescale } = chapter.telemetry;
  const shift = (sample: MotionSample): MotionSample => ({
    ...sample,
    timestamp: microseconds(sample.timestamp + start),
  });
  const onOrientation = (sample: MotionSample): MotionSample =>
    shift({ ...sample, value: rotate(IMU_TO_ORIENTATION, sample.value) });
  const sensors = readMotion(reader, samples, timescale);
  const frames = readFrameOrientation(reader, samples, timescale);
  return {
    angularVelocity: sensors.angularVelocity.map((sample) => onOrientation(sample)),
    acceleration: sensors.acceleration.map((sample) => onOrientation(sample)),
    gravity: frames.gravity.map((sample) =>
      shift({ ...sample, value: [-sample.value[0], -sample.value[1], -sample.value[2]] as const }),
    ),
  };
}

function durationOf(video: EncodedVideo): number {
  let end = 0;
  for (const frame of video.frames) end = Math.max(end, frame.timestamp + frame.duration);
  return end;
}
