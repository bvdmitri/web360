import type { DecodeRange, EncodedVideo, RandomAccessSource } from '@web360/core';

const DEFAULT_AHEAD = 4;

/** What the decoding uses of a WebCodecs `VideoDecoder`. */
export interface DecoderPort {
  readonly decodeQueueSize: number;
  ondequeue: ((event: Event) => void) | null;
  configure(config: VideoDecoderConfig): void;
  decode(chunk: EncodedVideoChunk): void;
  flush(): Promise<void>;
  close(): void;
}

/** How decoders and chunks are made: the browser's WebCodecs, or a test double. */
export interface Codecs {
  createDecoder(init: VideoDecoderInit): DecoderPort;
  createChunk(init: EncodedVideoChunkInit): EncodedVideoChunk;
}

/** The browser's WebCodecs as {@link Codecs}. */
export function browserCodecs(): Codecs {
  return {
    createDecoder: (init) => new VideoDecoder(init),
    createChunk: (init) => new EncodedVideoChunk(init),
  };
}

/** One video to decode: where its bytes are, which frames to feed, and which to keep. */
export interface DecodeJob {
  readonly source: RandomAccessSource;
  readonly video: EncodedVideo;
  readonly range: DecodeRange;
  readonly wanted: readonly number[];
  readonly codecs: Codecs;
  readonly signal?: AbortSignal;
  readonly ahead?: number;
}

interface Decoding {
  readonly decoder: DecoderPort;
  readonly ready: VideoFrame[];
  failure: unknown;
  wake: () => void;
}

/**
 * Decodes a range of a video's frames and yields the wanted ones, in presentation order.
 *
 * @remarks Frames are read from `source` and fed in decode order from `range.start` (a sync frame)
 * to `range.end`, at most `ahead` queued in the decoder at a time, so a long video never fills
 * memory. The decoder outputs frames in presentation order; a frame whose timestamp is in `wanted`
 * is yielded, and the caller closes it, while any other (the lead-in from the sync frame) is closed
 * here. A decoder error, or `signal` aborting, ends the iteration with that error. However it ends,
 * the decoder is closed, and so is every frame not yet handed out.
 */
export async function* decodeVideo(job: DecodeJob): AsyncGenerator<VideoFrame, void, undefined> {
  const wanted = new Set(job.wanted);
  const decoding = start(job, wanted);
  try {
    let next = job.range.start;
    let isFlushed = false;
    while (!isFlushed || decoding.ready.length > 0) {
      fail(decoding, job.signal);
      const frame = decoding.ready.shift();
      if (frame !== undefined) {
        yield frame;
      } else if (next <= job.range.end) {
        next = await feed(job, decoding, next);
      } else {
        await decoding.decoder.flush();
        isFlushed = true;
      }
    }
    fail(decoding, job.signal);
  } finally {
    for (const frame of decoding.ready.splice(0)) frame.close();
    decoding.decoder.close();
  }
}

function start(job: DecodeJob, wanted: ReadonlySet<number>): Decoding {
  const decoding: Decoding = {
    ready: [],
    failure: undefined,
    wake: (): void => {
      // Nothing waits until the decoder's queue is full.
    },
    decoder: job.codecs.createDecoder({
      output: (frame) => {
        if (wanted.has(frame.timestamp)) decoding.ready.push(frame);
        else frame.close();
        decoding.wake();
      },
      error: (error) => {
        decoding.failure = error;
        decoding.wake();
      },
    }),
  };
  decoding.decoder.ondequeue = (): void => {
    decoding.wake();
  };
  decoding.decoder.configure({
    codec: job.video.codec,
    description: job.video.decoderConfig,
    codedWidth: job.video.width,
    codedHeight: job.video.height,
  });
  return decoding;
}

async function feed(job: DecodeJob, decoding: Decoding, index: number): Promise<number> {
  if (decoding.decoder.decodeQueueSize >= (job.ahead ?? DEFAULT_AHEAD)) {
    await new Promise<void>((resolve) => {
      decoding.wake = resolve;
    });
    return index;
  }
  const frame = job.video.frames[index];
  if (frame === undefined) return index + 1;
  const data = await job.source.read(frame.offset, frame.size);
  decoding.decoder.decode(
    job.codecs.createChunk({
      type: frame.isSync ? 'key' : 'delta',
      timestamp: frame.timestamp,
      duration: frame.duration,
      data,
    }),
  );
  return index + 1;
}

function fail(decoding: Decoding, signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
  const { failure } = decoding;
  if (failure === undefined) return;
  throw failure instanceof Error ? failure : new Error('the decoder failed', { cause: failure });
}
