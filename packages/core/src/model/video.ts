import type { Microseconds, Seconds } from '../shared/units/units';
import type { CameraRecording, LensImage } from './recording';

/** One encoded video frame: where its bytes are in its file and when it shows. */
export interface EncodedFrame {
  readonly offset: number;
  readonly size: number;
  readonly timestamp: Microseconds;
  readonly duration: Microseconds;
  readonly isSync: boolean;
}

/**
 * One file's video, ready for a decoder: its codec, configuration and frames.
 *
 * @remarks `codec` and `decoderConfig` are what a WebCodecs `VideoDecoder` is configured with (the
 * codec string and its description). `frames` come in decode order, timed on the file's media
 * clock from its first frame; the edit list is not applied.
 */
export interface EncodedVideo {
  readonly codec: string;
  readonly decoderConfig: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly EncodedFrame[];
}

/**
 * An opened recording: its model, the calibration canvas, its videos and where each lens's image is
 * in them.
 *
 * @remarks `images` follows `recording.lenses`: lens `i` is read from video `images[i].texture`.
 * `duration` is the primary video's. Where each video's bytes are read from is the opener's
 * business (`openInsta360` returns a source per video beside this). A vendor's opener (`openInsta360`) produces it, and the
 * rendition works on it without knowing the vendor.
 */
export interface OpenedRecording {
  readonly recording: CameraRecording;
  readonly canvas: readonly [number, number];
  readonly videos: readonly EncodedVideo[];
  readonly images: readonly LensImage[];
  readonly duration: Seconds;
}
