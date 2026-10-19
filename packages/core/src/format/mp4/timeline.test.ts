import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildSamples, type SampleTables } from './timeline';

const tablesOf = (over: Partial<SampleTables>): SampleTables => ({
  times: [],
  compositionOffsets: [],
  syncSamples: [],
  sizes: { count: 0, uniformSize: 0, sizes: [] },
  sampleToChunk: [],
  chunkOffsets: [],
  ...over,
});

describe('mp4 timeline', () => {
  it('places and times each sample across chunks, with composition offsets and sync flags', () => {
    const samples = buildSamples(
      tablesOf({
        chunkOffsets: [1000, 2000],
        sampleToChunk: [{ firstChunk: 1, samplesPerChunk: 2, descriptionIndex: 1 }],
        sizes: { count: 4, uniformSize: 0, sizes: [10, 20, 30, 40] },
        times: [{ count: 4, delta: 100 }],
        compositionOffsets: [{ count: 4, offset: 5 }],
        syncSamples: [1, 3],
      }),
    );
    expect(samples).toEqual([
      { offset: 1000, size: 10, decodeTime: 0, compositionTime: 5, duration: 100, isSync: true },
      {
        offset: 1010,
        size: 20,
        decodeTime: 100,
        compositionTime: 105,
        duration: 100,
        isSync: false,
      },
      {
        offset: 2000,
        size: 30,
        decodeTime: 200,
        compositionTime: 205,
        duration: 100,
        isSync: true,
      },
      {
        offset: 2030,
        size: 40,
        decodeTime: 300,
        compositionTime: 305,
        duration: 100,
        isSync: false,
      },
    ]);
  });

  it('treats a uniform size and a missing sync table as every sample equal and sync', () => {
    const samples = buildSamples(
      tablesOf({
        chunkOffsets: [500],
        sampleToChunk: [{ firstChunk: 1, samplesPerChunk: 3, descriptionIndex: 1 }],
        sizes: { count: 3, uniformSize: 100, sizes: [] },
        times: [{ count: 3, delta: 50 }],
      }),
    );
    expect(samples.map((s) => [s.offset, s.compositionTime, s.isSync])).toEqual([
      [500, 0, true],
      [600, 50, true],
      [700, 100, true],
    ]);
  });

  it('follows sample-to-chunk runs that change the chunk layout partway', () => {
    const samples = buildSamples(
      tablesOf({
        chunkOffsets: [0, 100, 200],
        sampleToChunk: [
          { firstChunk: 1, samplesPerChunk: 1, descriptionIndex: 1 },
          { firstChunk: 3, samplesPerChunk: 2, descriptionIndex: 1 },
        ],
        sizes: { count: 4, uniformSize: 10, sizes: [] },
        times: [{ count: 4, delta: 1 }],
      }),
    );
    expect(samples.map((s) => s.offset)).toEqual([0, 100, 200, 210]);
  });

  it('accumulates decode time as the running sum of the durations', () => {
    const duration = fc.integer({ min: 1, max: 1000 });
    fc.assert(
      fc.property(fc.array(duration, { minLength: 1, maxLength: 30 }), (durations) => {
        const samples = buildSamples(
          tablesOf({
            chunkOffsets: [0],
            sampleToChunk: [
              { firstChunk: 1, samplesPerChunk: durations.length, descriptionIndex: 1 },
            ],
            sizes: { count: durations.length, uniformSize: 1, sizes: [] },
            times: durations.map((delta) => ({ count: 1, delta })),
          }),
        );
        let decodeTime = 0;
        for (const [index, sample] of samples.entries()) {
          expect(sample.decodeTime).toBe(decodeTime);
          decodeTime += durations[index] ?? 0;
        }
      }),
    );
  });
});
