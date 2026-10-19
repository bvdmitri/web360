import { memorySource, microseconds, type EncodedFrame, type EncodedVideo } from '@web360/core';
import { describe, expect, it } from 'vitest';

import { decodeVideo, type Codecs, type DecoderPort } from './decode';

const PERIOD = 1000;

// Frames in decode order with presentation slots that need a reorder, as B-frames do.
const ORDER = [0, 2, 1, 3, 5, 4, 6, 8, 7, 9];
const video: EncodedVideo = {
  codec: 'avc1.4d4034',
  decoderConfig: Uint8Array.from([1, 2, 3]),
  width: 32,
  height: 32,
  frames: ORDER.map((slot, index): EncodedFrame => ({
    offset: index * 4,
    size: 4,
    timestamp: microseconds(slot * PERIOD),
    duration: microseconds(PERIOD),
    isSync: index % 4 === 0,
  })),
};
const source = memorySource(new Uint8Array(ORDER.length * 4).map((...[, index]) => index));

interface FakeFrame {
  readonly timestamp: number;
  isClosed: boolean;
  close(): void;
}

interface Fake {
  readonly codecs: Codecs;
  readonly frames: FakeFrame[];
  readonly chunks: { type: string; timestamp: number; bytes: number[] }[];
  configured: VideoDecoderConfig | undefined;
  largestQueue: number;
  isClosed: boolean;
}

// A decoder that holds two frames to reorder, outputs asynchronously, and fails on request.
const fake = (options: { readonly failAt?: number } = {}): Fake => {
  const state: Fake = {
    frames: [],
    chunks: [],
    configured: undefined,
    largestQueue: 0,
    isClosed: false,
    codecs: {
      createChunk: (init) => init as unknown as EncodedVideoChunk,
      createDecoder: (init) => {
        const held: number[] = [];
        let queued = 0;
        const emit = (timestamp: number): void => {
          const frame: FakeFrame = {
            timestamp,
            isClosed: false,
            close: () => {
              frame.isClosed = true;
            },
          };
          state.frames.push(frame);
          init.output(frame as unknown as VideoFrame);
        };
        const release = (): void => {
          held.sort((a, b) => a - b);
          const first = held.shift();
          if (first !== undefined) emit(first);
        };
        const decoder: DecoderPort = {
          get decodeQueueSize() {
            return queued;
          },
          ondequeue: null,
          configure: (config) => {
            state.configured = config;
          },
          decode: (chunk) => {
            const init = chunk as unknown as EncodedVideoChunkInit;
            const bytes = [...new Uint8Array(init.data as ArrayBuffer)];
            state.chunks.push({ type: init.type, timestamp: init.timestamp, bytes });
            queued += 1;
            const number = state.chunks.length;
            state.largestQueue = Math.max(state.largestQueue, queued);
            setTimeout(() => {
              queued -= 1;
              if (options.failAt === number) {
                decoderError(new Error('broken stream'));
                return;
              }
              held.push(init.timestamp);
              if (held.length > 2) release();
              decoder.ondequeue?.(new Event('dequeue'));
            }, 0);
          },
          flush: async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            while (held.length > 0) release();
          },
          close: () => {
            state.isClosed = true;
          },
        };
        const decoderError = (error: Error): void => {
          init.error(new DOMException(error.message, 'EncodingError'));
        };
        return decoder;
      },
    },
  };
  return state;
};

const collect = async (frames: AsyncIterable<VideoFrame>): Promise<number[]> => {
  const times: number[] = [];
  for await (const frame of frames) {
    times.push(frame.timestamp);
    frame.close();
  }
  return times;
};

describe('decoding a lens video', () => {
  it('configures the decoder with the codec, its description and the coded size', async () => {
    const decoder = fake();
    await collect(
      decodeVideo({
        source,
        video,
        range: { start: 0, end: 9 },
        wanted: [],
        codecs: decoder.codecs,
      }),
    );
    expect(decoder.configured).toMatchObject({
      codec: 'avc1.4d4034',
      codedWidth: 32,
      codedHeight: 32,
    });
    expect([...new Uint8Array(decoder.configured?.description as ArrayBuffer)]).toEqual([1, 2, 3]);
  });

  it('feeds the range in decode order and yields only the wanted frames, in presentation order', async () => {
    const decoder = fake();
    const times = await collect(
      decodeVideo({
        source,
        video,
        range: { start: 4, end: 8 },
        wanted: [5000, 6000, 7000],
        codecs: decoder.codecs,
      }),
    );
    expect(times).toEqual([5000, 6000, 7000]);
    expect(decoder.chunks.map((chunk) => chunk.timestamp)).toEqual([5000, 4000, 6000, 8000, 7000]);
    expect(decoder.chunks[0]).toMatchObject({ type: 'key', bytes: [16, 17, 18, 19] });
    expect(decoder.chunks[1]?.type).toBe('delta');
    expect(decoder.frames.filter((frame) => !frame.isClosed)).toEqual([]);
    expect(decoder.isClosed).toBe(true);
  });

  it('keeps no more than a few chunks queued ahead', async () => {
    const decoder = fake();
    await collect(
      decodeVideo({
        source,
        video,
        range: { start: 0, end: 9 },
        wanted: ORDER.map((slot) => slot * PERIOD),
        codecs: decoder.codecs,
        ahead: 2,
      }),
    );
    expect(decoder.largestQueue).toBeLessThanOrEqual(2);
  });

  it('stops with the decoder error', async () => {
    const decoder = fake({ failAt: 3 });
    await expect(
      collect(
        decodeVideo({
          source,
          video,
          range: { start: 0, end: 9 },
          wanted: [9000],
          codecs: decoder.codecs,
        }),
      ),
    ).rejects.toThrow(/broken stream/);
    expect(decoder.isClosed).toBe(true);
  });

  it('stops when aborted, closing what it holds', async () => {
    const decoder = fake();
    const controller = new AbortController();
    const frames = decodeVideo({
      source,
      video,
      range: { start: 0, end: 9 },
      wanted: ORDER.map((slot) => slot * PERIOD),
      codecs: decoder.codecs,
      signal: controller.signal,
    });
    const first = await frames.next();
    first.value?.close();
    controller.abort(new Error('canceled'));
    await expect(frames.next()).rejects.toThrow(/canceled/);
    expect(decoder.frames.filter((frame) => !frame.isClosed)).toEqual([]);
    expect(decoder.isClosed).toBe(true);
  });

  it('closes the decoder and leftover frames when the consumer stops early', async () => {
    const decoder = fake();
    const frames = decodeVideo({
      source,
      video,
      range: { start: 0, end: 9 },
      wanted: ORDER.map((slot) => slot * PERIOD),
      codecs: decoder.codecs,
    });
    const first = await frames.next();
    first.value?.close();
    await frames.return(undefined);
    expect(decoder.isClosed).toBe(true);
    expect(decoder.frames.filter((frame) => !frame.isClosed)).toEqual([]);
  });
});
