import {
  estimateColour,
  frameAt,
  packStitch,
  type ColourCorrection,
  type DecodeRange,
  type EncodedVideo,
  type RandomAccessSource,
  type SpanFrame,
} from '@web360/core';
import { decodeVideo } from '@web360/webcodecs';
import { createStitcher, type Stitcher } from '@web360/webgpu';

import { blendColour } from './colour';
import { Web360Error } from './errors';
import type { Presenter } from './presenter';
import type { OpenedRendition } from './options';

const MICROS_PER_SECOND = 1_000_000;
const COLOUR_EVERY = 30;
const COLOUR_WEIGHT = 0.3;
const PICTURE_SIZE = 256;
const SHUTTER_STEPS = 16;
const HALVES = 4;

interface LensStream {
  at(timestamp: number): Promise<VideoFrame>;
  close(): Promise<void>;
}

/**
 * Decodes, stitches and presents the frames of an opened rendition's span, in order.
 *
 * @remarks Each video is decoded once, in step with the output: for each planned frame every
 * video's decoder is advanced to the frame it pairs with, and a frame two output frames pair with
 * (a lens file that dropped one) is kept and reused. The lens frames are copied to textures, the
 * core's stitch for the moment is packed and rendered, and the presented frame is yielded with its
 * time from the span's start. With colour matching on (the default), the lenses' vignetting and gains
 * are estimated on the first frame and every thirtieth after it, blended into the running correction
 * so exposure follows the scene without flicker. Ending early or failing releases every decoder,
 * texture and frame held.
 */
export async function* renderFrames(
  rendition: OpenedRendition,
): AsyncGenerator<VideoFrame, void, undefined> {
  const pipeline = openPipeline(rendition);
  try {
    for (const [row, planned] of rendition.span.frames.entries()) {
      rendition.options.signal?.throwIfAborted();
      await drawFrame(pipeline, { row, planned });
      yield await pipeline.presenter.capture(timingOf(rendition, planned));
    }
  } finally {
    await Promise.all(pipeline.lenses.map((lens) => lens.close()));
    for (const texture of pipeline.textures) texture.destroy();
    pipeline.stitcher.destroy();
    pipeline.presenter.destroy();
  }
}

interface Pipeline {
  readonly rendition: OpenedRendition;
  readonly lenses: readonly LensStream[];
  readonly textures: readonly GPUTexture[];
  readonly presenter: Presenter;
  readonly stitcher: Stitcher;
  colour: ColourCorrection | undefined;
}

function openPipeline(rendition: OpenedRendition): Pipeline {
  const { opened, device, platform, options } = rendition;
  const size = { width: options.width, height: 2 * Math.round(options.width / HALVES) };
  const presenter = platform.presenter(device, size);
  return {
    rendition,
    lenses: lensInputs(rendition).map((input) => lensStream(rendition, input)),
    textures: opened.videos.map((video) => lensTexture(device, video)),
    presenter,
    stitcher: createStitcher(device, presenter.format),
    colour: undefined,
  };
}

async function drawFrame(
  pipeline: Pipeline,
  step: { readonly row: number; readonly planned: SpanFrame },
): Promise<void> {
  const { rendition, textures } = pipeline;
  const { opened, device, platform, options } = rendition;
  const frames = await lensFrames(pipeline.lenses, step.planned);
  if (options.gainMatching !== false && step.row % COLOUR_EVERY === 0) {
    pipeline.colour = measuredColour(rendition, { frames, colour: pipeline.colour });
  }
  for (const [which, frame] of frames.entries()) {
    const texture = textures[which];
    if (texture !== undefined) platform.upload(device, frame, texture);
  }
  const context = {
    opened,
    attitude: rendition.attitude,
    view: rendition.view,
    width: options.width,
    shutterSteps: SHUTTER_STEPS,
    ...pipeline.colour,
  };
  const stitch = frameAt(context, step.planned.timestamp);
  pipeline.stitcher.render({ packed: packStitch(stitch), textures }, pipeline.presenter.target());
}

function lensTexture(device: GPUDevice, video: EncodedVideo): GPUTexture {
  return device.createTexture({
    size: [video.width, video.height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

interface LensInput {
  readonly video: EncodedVideo;
  readonly source: RandomAccessSource;
  readonly range: DecodeRange;
  readonly times: readonly number[];
}

function lensInputs(rendition: OpenedRendition): LensInput[] {
  const { opened, span } = rendition;
  return opened.videos.map((video, which) => {
    const source = opened.sources[which];
    const range = span.decode[which];
    if (source === undefined || range === undefined) {
      throw new Web360Error('unreadable-recording', `video ${which} has no source to read`);
    }
    return { video, source, range, times: span.frames.map((planned) => planned.times[which] ?? 0) };
  });
}

function lensStream(rendition: OpenedRendition, input: LensInput): LensStream {
  const decoded = decodeVideo({
    source: input.source,
    video: input.video,
    range: input.range,
    wanted: input.times,
    codecs: rendition.platform.codecs,
    ...(rendition.options.signal !== undefined && { signal: rendition.options.signal }),
  });
  let current: VideoFrame | undefined;
  return {
    at: async (timestamp): Promise<VideoFrame> => {
      while (current === undefined || current.timestamp < timestamp) {
        current?.close();
        current = undefined;
        current = await nextFrame(rendition, decoded);
      }
      return current;
    },
    close: async (): Promise<void> => {
      current?.close();
      await decoded.return(undefined);
    },
  };
}

async function nextFrame(
  rendition: OpenedRendition,
  decoded: AsyncGenerator<VideoFrame, void, undefined>,
): Promise<VideoFrame> {
  try {
    const next = await decoded.next();
    if (next.done === true) throw new Web360Error('decode', 'the video ended before the span did');
    return next.value;
  } catch (error) {
    if (rendition.options.signal?.aborted === true || error instanceof Web360Error) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Web360Error('decode', message, { cause: error });
  }
}

function lensFrames(lenses: readonly LensStream[], planned: SpanFrame): Promise<VideoFrame[]> {
  return Promise.all(
    lenses.map((lens, which) => lens.at(planned.times[which] ?? planned.timestamp)),
  );
}

function measuredColour(
  rendition: OpenedRendition,
  state: { readonly frames: readonly VideoFrame[]; readonly colour: ColourCorrection | undefined },
): ColourCorrection {
  const { opened, platform } = rendition;
  const estimate = estimateColour({
    lenses: opened.recording.lenses,
    images: opened.images,
    pictures: state.frames.map((frame) => platform.picture(frame, PICTURE_SIZE)),
  });
  return blendColour(state.colour, estimate, COLOUR_WEIGHT);
}

function timingOf(
  rendition: OpenedRendition,
  planned: SpanFrame,
): { readonly timestamp: number; readonly duration: number } {
  return {
    timestamp: Math.round(planned.timestamp - rendition.from * MICROS_PER_SECOND),
    duration: rendition.frameDuration,
  };
}
