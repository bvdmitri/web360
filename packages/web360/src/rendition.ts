import {
  levelOrientation,
  microseconds,
  openInsta360,
  planSpan,
  viewOf,
  type Insta360Opened,
  type Span,
  type Stabilization,
} from '@web360/core';

import { blobSource } from './blob';
import { openingError } from './errors';
import { renderFrames } from './frames';
import type { OpenedRendition, RenditionOptions } from './options';
import { browserPlatform } from './platform';

const MICROS_PER_SECOND = 1_000_000;
const DEFAULT_STABILIZATION: Stabilization = 'smooth';

/** One file of a recording, as the user picked it. */
export interface RecordingFile {
  readonly blob: Blob;
  readonly name?: string;
}

/** The files of a recording: the one with the trailer, and a split recording's other lens. */
export interface RenditionSource {
  readonly main: RecordingFile;
  readonly second?: RecordingFile;
}

/** What a rendition says of its recording: its whole length in seconds and its camera model. */
export interface RenditionMetadata {
  readonly duration: number;
  readonly model: string;
}

/**
 * A recording opened for rendering one span of it.
 *
 * @remarks `frames()` yields the stitched frames of the span in order, timed in microseconds from the
 * span's start; the caller closes each. `duration` is the span's length in seconds. `dispose`
 * releases the GPU device; frames already yielded stay valid until closed.
 */
export interface Rendition {
  readonly metadata: RenditionMetadata;
  readonly duration: number;
  frames(): AsyncGenerator<VideoFrame, void, undefined>;
  dispose(): void;
}

/**
 * Opens a recording for rendering a span of it as stitched, stabilized equirectangular frames.
 *
 * @remarks It reads the recording's trailer and movies (not its media), checks the browser can
 * decode its video and has a WebGPU device, fuses the motion into an attitude and plans the span;
 * decoding and stitching wait for `frames()`. Failures throw a `Web360Error` whose code says why
 * (a missing second file, an unreadable recording, no WebGPU, no WebCodecs, an unsupported codec).
 */
export async function openRendition(
  source: RenditionSource,
  options: RenditionOptions,
): Promise<Rendition> {
  const platform = options.platform ?? browserPlatform();
  const opened = await openFiles(source);
  for (const video of opened.videos) await platform.ensureDecodable(video);
  const device = await platform.device();
  const window = windowOf(opened, options);
  const rendition: OpenedRendition = {
    ...motionOf(opened, options),
    opened,
    span: spanOf(opened, window),
    from: window.from,
    frameDuration: framePeriod(opened),
    device,
    platform,
    options,
  };
  return {
    metadata: { duration: opened.duration, model: opened.recording.model },
    duration: Math.max(0, window.to - window.from),
    frames: () => renderFrames(rendition),
    dispose: (): void => {
      device.destroy();
    },
  };
}

function windowOf(
  opened: Insta360Opened,
  options: RenditionOptions,
): { readonly from: number; readonly to: number } {
  return {
    from: Math.max(0, options.from ?? 0),
    to: Math.min(opened.duration, options.to ?? opened.duration),
  };
}

function spanOf(
  opened: Insta360Opened,
  window: { readonly from: number; readonly to: number },
): Span {
  return planSpan(opened.videos, {
    from: microseconds(window.from * MICROS_PER_SECOND),
    to: microseconds(window.to * MICROS_PER_SECOND),
  });
}

function motionOf(
  opened: Insta360Opened,
  options: RenditionOptions,
): Pick<OpenedRendition, 'attitude' | 'view'> {
  const { recording } = opened;
  const attitude = levelOrientation(recording.angularVelocity, recording.acceleration);
  const view = viewOf(attitude, {
    stabilization: options.stabilization ?? DEFAULT_STABILIZATION,
    ...(options.smoothing !== undefined && { smoothing: options.smoothing }),
  });
  return { attitude, view };
}

// The video's own frame period: the recording's stated rate is rounded (30 for 29.97).
function framePeriod(opened: Insta360Opened): number {
  const count = opened.videos[0]?.frames.length ?? 0;
  return count === 0 ? 0 : (opened.duration * MICROS_PER_SECOND) / count;
}

async function openFiles(source: RenditionSource): Promise<Insta360Opened> {
  try {
    return await openInsta360({
      primary: blobSource(source.main.blob),
      ...(source.second !== undefined && { secondary: blobSource(source.second.blob) }),
    });
  } catch (error) {
    throw openingError(error);
  }
}
