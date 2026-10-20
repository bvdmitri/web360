import type { EncodedFrame, EncodedVideo } from '../../model/video';
import { microseconds, type Microseconds } from '../../shared/units/units';
import { samplesOf, type Track } from './movie';

const MICROS_PER_SECOND = 1_000_000;
const VIDEO_HANDLER = 'vide';

/**
 * A track's samples as encoded video frames: in decode order, timed in whole microseconds on the
 * track's media clock (as a decoder's chunk and frame timestamps are).
 */
export function encodedFramesOf(track: Track): EncodedFrame[] {
  const toMicros = (time: number): Microseconds =>
    microseconds(Math.round((time * MICROS_PER_SECOND) / track.timescale));
  return samplesOf(track).map((sample) => ({
    offset: sample.offset,
    size: sample.size,
    timestamp: toMicros(sample.compositionTime),
    duration: toMicros(sample.duration),
    isSync: sample.isSync,
  }));
}

/** A movie's video tracks, each ready for a decoder, in track order. */
export function encodedVideosOf(tracks: readonly Track[]): EncodedVideo[] {
  return tracks.flatMap((track) =>
    track.handler === VIDEO_HANDLER && track.sampleEntry !== undefined
      ? [{ ...track.sampleEntry, frames: encodedFramesOf(track) }]
      : [],
  );
}
