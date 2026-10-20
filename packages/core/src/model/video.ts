import type { Microseconds, Seconds } from '../shared/units/units';
import type { CubeMap } from './cube';
import type { CameraRecording, LensImage } from './recording';

/**
 * One encoded video frame: where its bytes are in its file and when it shows.
 *
 * @remarks `source` names the file it is in, as an index into the files its opener returns beside
 * the recording (each video's file for an Insta360, each chapter for a GoPro); a frame without one
 * is in the first.
 */
export interface EncodedFrame {
  readonly source?: number;
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
 * clock from its first frame in whole microseconds; the edit list is not applied.
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
 * `duration` is the primary video's. Which files the bytes are read from is the opener's business:
 * it returns them beside this, and each frame names its file ({@link EncodedFrame}). A vendor's
 * opener (`openInsta360`, `openGoPro`) produces it, and the rendition works on it without knowing
 * the vendor. `cube` is set for a camera that stores an equi-angular cube map it stitched itself
 * (ADR 0020); its `recording.lenses` and `images` are then empty.
 */
export interface OpenedRecording {
  readonly recording: CameraRecording;
  readonly canvas: readonly [number, number];
  readonly videos: readonly EncodedVideo[];
  readonly images: readonly LensImage[];
  readonly duration: Seconds;
  readonly cube?: CubeMap;
}
