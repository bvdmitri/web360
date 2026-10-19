import type { CameraRecording, LensImage } from '../../model/recording';
import type { RandomAccessSource } from '../../ports/source';
import { ByteReader } from '../../shared/binary/byteReader';
import { microseconds, seconds, type Microseconds, type Seconds } from '../../shared/units/units';
import { readMovieFrom } from '../mp4/locate';
import { samplesOf, UnsupportedContainerError, type Track } from '../mp4/movie';
import { readCalibration } from './calibration';
import { readInfo } from './info';
import { readInsta360Recording } from './recording';
import { readTrailer, TRAILER_FOOTER_SIZE, trailerLength } from './trailer';

const INFO = 1;
const MICROS_PER_SECOND = 1_000_000;
const VIDEO_HANDLER = 'vide';
const ASPECT_TOLERANCE = 0.01;

/** The files of one Insta360 recording: the one with the trailer, and a split recording's other lens. */
export interface Insta360Files {
  readonly primary: RandomAccessSource;
  readonly secondary?: RandomAccessSource;
}

/** One encoded video frame: where its bytes are in its file and when it shows. */
export interface EncodedFrame {
  readonly offset: number;
  readonly size: number;
  readonly timestamp: Microseconds;
  readonly duration: Microseconds;
  readonly isSync: boolean;
}

/**
 * One file's video, ready for a decoder: its source, codec, configuration and frames.
 *
 * @remarks `codec` and `decoderConfig` are what a WebCodecs `VideoDecoder` is configured with (the
 * codec string and its description). `frames` come in decode order, timed on the file's media
 * clock from its first frame; the edit list is not applied.
 */
export interface EncodedVideo {
  readonly source: RandomAccessSource;
  readonly codec: string;
  readonly decoderConfig: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly EncodedFrame[];
}

/**
 * An opened Insta360 recording: its model, the calibration canvas, its videos and where each lens's
 * image is in them.
 *
 * @remarks `images` follows `recording.lenses`: lens `i` is read from video `images[i].texture`.
 * `duration` is the primary video's.
 */
export interface Insta360Recording {
  readonly recording: CameraRecording;
  readonly canvas: readonly [number, number];
  readonly videos: readonly EncodedVideo[];
  readonly images: readonly LensImage[];
  readonly duration: Seconds;
}

/** One file of a recording that splits its lenses across two files, opened without the other. */
export class MissingLensFileError extends Error {
  public override readonly name = 'MissingLensFileError';
}

/**
 * Opens an Insta360 recording from its files, reading the trailer and each file's movie but no
 * media.
 *
 * @remarks The primary file carries the trailer (the `_00_` half of a split recording). A split
 * recording stores each lens in its own file, a video with the aspect of the lens's share of the
 * canvas (its frames cover that share, scaled); it needs `secondary`, and throws {@link MissingLensFileError} without it. Otherwise one video covers
 * the whole canvas for both lenses. Throws `NotInsta360Error` for a file with no Insta360 trailer.
 */
export async function openInsta360(files: Insta360Files): Promise<Insta360Recording> {
  const tail = await readTail(files.primary);
  const recording = readInsta360Recording(tail);
  const canvas = canvasOf(tail);
  const primary = await videoOf(files.primary);
  const isSplitRecording = isSplit(primary, { canvas, lenses: recording.lenses.length });
  if (isSplitRecording && files.secondary === undefined) {
    throw new MissingLensFileError('this recording splits its lenses across two files');
  }
  const videos =
    isSplitRecording && files.secondary !== undefined
      ? [primary, await videoOf(files.secondary)]
      : [primary];
  return {
    recording,
    canvas,
    videos,
    images: recording.lenses.map((...[, index]) =>
      imageOf({ canvas, isSplit: isSplitRecording, index }),
    ),
    duration: durationOf(primary),
  };
}

// A split recording's video holds one lens: the canvas's aspect over the lens count.
function isSplit(
  video: EncodedVideo,
  layout: { readonly canvas: readonly [number, number]; readonly lenses: number },
): boolean {
  const lensAspect = layout.canvas[0] / layout.lenses / layout.canvas[1];
  return layout.lenses > 1 && Math.abs(video.width / video.height - lensAspect) < ASPECT_TOLERANCE;
}

async function readTail(source: RandomAccessSource): Promise<ByteReader> {
  const footerSize = Math.min(TRAILER_FOOTER_SIZE, source.size);
  const footer = ByteReader.of(await source.read(source.size - footerSize, footerSize));
  const length = Math.min(trailerLength(footer), source.size);
  return ByteReader.of(await source.read(source.size - length, length));
}

function canvasOf(tail: ByteReader): readonly [number, number] {
  const info = readTrailer(tail).records.find((record) => record.id === INFO);
  if (info === undefined) throw new Error('the recording has no info record');
  return readCalibration(readInfo(tail, info.region).calibration).canvas;
}

async function videoOf(source: RandomAccessSource): Promise<EncodedVideo> {
  const movie = await readMovieFrom(source);
  const track = movie.tracks.find((candidate) => candidate.handler === VIDEO_HANDLER);
  const entry = track?.sampleEntry;
  if (track === undefined || entry === undefined) {
    throw new UnsupportedContainerError('the file has no video track');
  }
  return { source, ...entry, frames: framesOf(track) };
}

function framesOf(track: Track): EncodedFrame[] {
  const toMicros = (time: number): Microseconds =>
    microseconds((time * MICROS_PER_SECOND) / track.timescale);
  return samplesOf(track).map((sample) => ({
    offset: sample.offset,
    size: sample.size,
    timestamp: toMicros(sample.compositionTime),
    duration: toMicros(sample.duration),
    isSync: sample.isSync,
  }));
}

function imageOf(lens: {
  readonly canvas: readonly [number, number];
  readonly isSplit: boolean;
  readonly index: number;
}): LensImage {
  const [width, height] = lens.canvas;
  if (!lens.isSplit) return { texture: 0, origin: [0, 0], extent: [width, height] };
  const half = width / 2;
  return { texture: lens.index, origin: [lens.index * half, 0], extent: [half, height] };
}

function durationOf(video: EncodedVideo): Seconds {
  let end = 0;
  for (const frame of video.frames) end = Math.max(end, frame.timestamp + frame.duration);
  return seconds(end / MICROS_PER_SECOND);
}
