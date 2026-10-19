import {
  MAX_SAMPLES,
  type CompositionOffsetEntry,
  type SampleSizes,
  type SampleToChunkEntry,
  type TimeToSampleEntry,
} from './sampleTable';

/** Where one sample's bytes are and when it decodes and composes, on the track's media clock. */
export interface Sample {
  readonly offset: number;
  readonly size: number;
  readonly decodeTime: number;
  readonly compositionTime: number;
  readonly duration: number;
  readonly isSync: boolean;
}

/** The parsed sample-table boxes of one track, the input to {@link buildSamples}. */
export interface SampleTables {
  readonly times: readonly TimeToSampleEntry[];
  readonly compositionOffsets: readonly CompositionOffsetEntry[];
  readonly syncSamples: readonly number[];
  readonly sizes: SampleSizes;
  readonly sampleToChunk: readonly SampleToChunkEntry[];
  readonly chunkOffsets: readonly number[];
}

/**
 * Flattens the sample tables of a track into one {@link Sample} per entry.
 *
 * @remarks Decode time is the running sum of the `stts` durations; composition time adds the
 * `ctts` offset, which is zero where the track has none. A sample's file offset is its chunk's
 * offset plus the sizes of the samples before it in that chunk. An empty sync table means every
 * sample is a sync sample. All times are in the track's media timescale. No more than
 * {@link MAX_SAMPLES} samples are produced, so a malformed table cannot exhaust memory.
 */
export function buildSamples(tables: SampleTables): Sample[] {
  const count = Math.min(tables.sizes.count, MAX_SAMPLES);
  const durations = expand(tables.times, (run) => run.delta, count);
  const offsets = expand(tables.compositionOffsets, (run) => run.offset, count);
  const positions = fileOffsets(tables.sampleToChunk, tables.chunkOffsets, tables.sizes);
  const syncs = new Set(tables.syncSamples);
  const areAllSync = tables.syncSamples.length === 0;
  const samples: Sample[] = [];
  let decodeTime = 0;
  for (let index = 0; index < count; index += 1) {
    const duration = durations[index] ?? 0;
    samples.push({
      offset: positions[index] ?? 0,
      size: sizeAt(tables.sizes, index),
      decodeTime,
      compositionTime: decodeTime + (offsets[index] ?? 0),
      duration,
      isSync: areAllSync || syncs.has(index + 1),
    });
    decodeTime += duration;
  }
  return samples;
}

function expand<T extends { readonly count: number }>(
  runs: readonly T[],
  select: (run: T) => number,
  limit: number,
): number[] {
  const values: number[] = [];
  for (const run of runs) {
    for (let step = 0; step < run.count && values.length < limit; step += 1)
      values.push(select(run));
  }
  return values;
}

function fileOffsets(
  runs: readonly SampleToChunkEntry[],
  chunkOffsets: readonly number[],
  sizes: SampleSizes,
): number[] {
  const limit = Math.min(sizes.count, MAX_SAMPLES);
  const positions: number[] = [];
  let sample = 0;
  for (const [index, chunkOffset] of chunkOffsets.entries()) {
    let position = chunkOffset;
    const held = samplesInChunk(runs, index + 1);
    for (let step = 0; step < held && sample < limit; step += 1) {
      positions.push(position);
      position += sizeAt(sizes, sample);
      sample += 1;
    }
  }
  return positions;
}

function samplesInChunk(runs: readonly SampleToChunkEntry[], chunk: number): number {
  let held = 0;
  for (const run of runs) {
    if (run.firstChunk <= chunk) held = run.samplesPerChunk;
  }
  return held;
}

function sizeAt(sizes: SampleSizes, index: number): number {
  return sizes.uniformSize === 0 ? (sizes.sizes[index] ?? 0) : sizes.uniformSize;
}
