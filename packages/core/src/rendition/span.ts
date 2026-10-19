import type { EncodedVideo } from '../model/video';
import type { Microseconds } from '../shared/units/units';

/** One output frame of a span: its time in the first video and the frame of each video it uses. */
export interface SpanFrame {
  readonly timestamp: Microseconds;
  readonly frames: readonly number[];
}

/** The decode-order frames of one video to feed a decoder, `start` to `end` inclusive. */
export interface DecodeRange {
  readonly start: number;
  readonly end: number;
}

/** What a rendition of a time window shows and what it has to decode for it. */
export interface Span {
  readonly frames: readonly SpanFrame[];
  readonly decode: readonly DecodeRange[];
}

/**
 * Plans the frames a rendition of `window` shows and the frames it decodes for them.
 *
 * @remarks The first video sets the output: its frames whose time falls in `[from, to)` (on its
 * media clock), in presentation order. Every other video contributes its frame nearest in time to
 * each, which pairs the lens files of a split recording frame for frame. Frame indices are in
 * decode order, as the videos list them. A decoder must start at a sync frame, so each video's
 * range starts at the last sync frame at or before the first frame it needs, and ends at the last
 * frame it needs in decode order. A window without frames decodes nothing (`end` below `start`).
 */
export function planSpan(
  videos: readonly EncodedVideo[],
  window: { readonly from: Microseconds; readonly to: Microseconds },
): Span {
  const [first = [], ...others] = videos.map((video) => byTime(video));
  const shown = first.filter(
    (entry) => entry.timestamp >= window.from && entry.timestamp < window.to,
  );
  const columns = [
    shown.map((entry) => entry.index),
    ...others.map((order) => shown.map((entry) => nearest(order, entry.timestamp))),
  ];
  return {
    frames: shown.map((entry, row) => ({
      timestamp: entry.timestamp,
      frames: columns.map((column) => column[row] ?? entry.index),
    })),
    decode: videos.map((video, which) => rangeFor(video, columns[which] ?? [])),
  };
}

interface Timed {
  readonly index: number;
  readonly timestamp: Microseconds;
}

function byTime(video: EncodedVideo): Timed[] {
  return video.frames
    .map((frame, index) => ({ index, timestamp: frame.timestamp }))
    .toSorted((a, b) => a.timestamp - b.timestamp);
}

function nearest(order: readonly Timed[], time: number): number {
  let best = { index: 0, distance: Infinity };
  for (const entry of order) {
    const distance = Math.abs(entry.timestamp - time);
    if (distance < best.distance) best = { index: entry.index, distance };
  }
  return best.index;
}

function rangeFor(video: EncodedVideo, needed: readonly number[]): DecodeRange {
  if (needed.length === 0) return { start: 0, end: -1 };
  const firstNeeded = Math.min(...needed);
  let start = 0;
  for (const [index, frame] of video.frames.entries()) {
    if (index > firstNeeded) break;
    if (frame.isSync) start = index;
  }
  return { start, end: Math.max(...needed) };
}
