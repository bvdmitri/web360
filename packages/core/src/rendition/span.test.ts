import { describe, expect, it } from 'vitest';

import type { EncodedFrame, EncodedVideo } from '../model/video';
import { microseconds } from '../shared/units/units';
import { planSpan } from './span';

const PERIOD = 1000;

// Frames in decode order; `order` gives each one's presentation slot, `syncEvery` the GOP length.
const video = (order: readonly number[], syncEvery: number, shift = 0): EncodedVideo => ({
  codec: 'avc1.4d4034',
  decoderConfig: new Uint8Array(),
  width: 16,
  height: 16,
  frames: order.map((slot, index): EncodedFrame => ({
    offset: index * 100,
    size: 100,
    timestamp: microseconds(slot * PERIOD + shift),
    duration: microseconds(PERIOD),
    isSync: index % syncEvery === 0,
  })),
});

const window = (
  from: number,
  to: number,
): { from: ReturnType<typeof microseconds>; to: ReturnType<typeof microseconds> } => ({
  from: microseconds(from),
  to: microseconds(to),
});

describe('planning a span', () => {
  it('outputs the frames inside the window in presentation order', () => {
    const span = planSpan([video([0, 2, 1, 3, 5, 4], 3)], window(1000, 5000));
    expect(span.frames.map((frame) => frame.timestamp)).toEqual([1000, 2000, 3000, 4000]);
    expect(span.frames.map((frame) => frame.frames[0])).toEqual([2, 1, 3, 5]);
  });

  it('decodes from the sync frame before the first one needed to the last one needed', () => {
    const span = planSpan([video([0, 1, 2, 3, 4, 5, 6, 7], 4)], window(5000, 7000));
    expect(span.decode).toEqual([{ start: 4, end: 6 }]);
  });

  it('pairs each output frame with the nearest frame of every other video', () => {
    const span = planSpan(
      [video([0, 1, 2, 3], 2), video([0, 1, 2, 3], 2, 300)],
      window(1000, 3000),
    );
    expect(span.frames.map((frame) => frame.frames)).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(span.decode[1]).toEqual({ start: 0, end: 2 });
  });

  it('is empty for a window without frames', () => {
    const span = planSpan([video([0, 1], 1)], window(9000, 10_000));
    expect(span).toEqual({ frames: [], decode: [{ start: 0, end: -1 }] });
  });

  it('plans nothing without videos', () => {
    expect(planSpan([], window(0, 1000))).toEqual({ frames: [], decode: [] });
  });

  it('starts at the first frame when nothing before the first needed one is a sync frame', () => {
    const span = planSpan([video([0, 1, 2, 3], 9), video([0, 1, 2, 3], 2)], window(2000, 3000));
    expect(span.decode).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 2 },
    ]);
  });
});
