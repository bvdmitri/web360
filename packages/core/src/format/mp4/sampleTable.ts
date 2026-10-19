import type { ByteReader } from '../../shared/binary/byteReader';
import { MalformedBoxError, type Box } from './box';
import { readFullBox } from './fullBox';

const COUNT_SIZE = 4;
const FIELD = 4;
const RUN_ENTRY = 8;
const SYNC_ENTRY = 4;
const CHUNK_RUN_ENTRY = 12;
const CHUNK32_ENTRY = 4;
const CHUNK64_ENTRY = 8;
const SIZE_HEADER = 8;

/**
 * The most samples web360 reads from one track.
 *
 * @remarks A sample count is a free 32-bit field, so a malformed file could claim billions and
 * exhaust memory as the tables expand. A count beyond this is refused when the size table is read,
 * and the timeline never materializes more than this many samples. It is far above any real
 * recording (over nine hours at 60 frames a second).
 */
export const MAX_SAMPLES = 1_048_576;

/** A run of consecutive samples that share a duration, from the `stts` box. */
export interface TimeToSampleEntry {
  readonly count: number;
  readonly delta: number;
}

/** A run of consecutive samples that share a composition offset, from the `ctts` box. */
export interface CompositionOffsetEntry {
  readonly count: number;
  readonly offset: number;
}

/** A run of consecutive chunks that share a layout, from the `stsc` box. */
export interface SampleToChunkEntry {
  readonly firstChunk: number;
  readonly samplesPerChunk: number;
  readonly descriptionIndex: number;
}

/**
 * The sample sizes of a track, from the `stsz` box.
 *
 * @remarks When `uniformSize` is non-zero every sample is that many bytes and `sizes` is empty;
 * otherwise `sizes` holds one size per sample and its length is `count`.
 */
export interface SampleSizes {
  readonly count: number;
  readonly uniformSize: number;
  readonly sizes: readonly number[];
}

/** The runs of the `stts` time-to-sample box, each a sample count and the delta they share. */
export function readTimeToSample(reader: ByteReader, box: Box): TimeToSampleEntry[] {
  return mapEntries(reader, box, {
    entrySize: RUN_ENTRY,
    read: (at) => ({ count: reader.u32be(at), delta: reader.u32be(at + FIELD) }),
  });
}

/**
 * The runs of the `ctts` composition-offset box.
 *
 * @remarks The offset is read signed in either box version, as a sample may be composed before
 * its decode time.
 */
export function readCompositionOffsets(reader: ByteReader, box: Box): CompositionOffsetEntry[] {
  return mapEntries(reader, box, {
    entrySize: RUN_ENTRY,
    read: (at) => ({ count: reader.u32be(at), offset: reader.i32be(at + FIELD) }),
  });
}

/** The one-based sample numbers the `stss` box lists as sync samples. */
export function readSyncSamples(reader: ByteReader, box: Box): number[] {
  return mapEntries(reader, box, { entrySize: SYNC_ENTRY, read: (at) => reader.u32be(at) });
}

/** The runs of the `stsc` sample-to-chunk box. */
export function readSampleToChunk(reader: ByteReader, box: Box): SampleToChunkEntry[] {
  return mapEntries(reader, box, {
    entrySize: CHUNK_RUN_ENTRY,
    read: (at) => ({
      firstChunk: reader.u32be(at),
      samplesPerChunk: reader.u32be(at + FIELD),
      descriptionIndex: reader.u32be(at + FIELD + FIELD),
    }),
  });
}

/** The absolute file offsets of each chunk, from the 32-bit `stco` box. */
export function readChunkOffsets32(reader: ByteReader, box: Box): number[] {
  return mapEntries(reader, box, { entrySize: CHUNK32_ENTRY, read: (at) => reader.u32be(at) });
}

/** The absolute file offsets of each chunk, from the 64-bit `co64` box. */
export function readChunkOffsets64(reader: ByteReader, box: Box): number[] {
  return mapEntries(reader, box, { entrySize: CHUNK64_ENTRY, read: (at) => reader.u64be(at) });
}

/** The sample sizes of the `stsz` box, uniform or one per sample. */
export function readSampleSizes(reader: ByteReader, box: Box): SampleSizes {
  const { fieldsStart } = readFullBox(reader, box);
  const uniformSize = reader.u32be(fieldsStart);
  const count = reader.u32be(fieldsStart + FIELD);
  if (count > MAX_SAMPLES) {
    throw new MalformedBoxError(
      box.type,
      box.start,
      `declares ${count} samples, beyond the ${MAX_SAMPLES} supported`,
    );
  }
  if (uniformSize !== 0) return { count, uniformSize, sizes: [] };
  const base = fieldsStart + SIZE_HEADER;
  guardFit(box, base + count * FIELD);
  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) sizes.push(reader.u32be(base + index * FIELD));
  return { count, uniformSize, sizes };
}

function mapEntries<T>(
  reader: ByteReader,
  box: Box,
  spec: { readonly entrySize: number; readonly read: (at: number) => T },
): T[] {
  const { fieldsStart } = readFullBox(reader, box);
  const count = reader.u32be(fieldsStart);
  const base = fieldsStart + COUNT_SIZE;
  guardFit(box, base + count * spec.entrySize);
  const entries: T[] = [];
  for (let index = 0; index < count; index += 1)
    entries.push(spec.read(base + index * spec.entrySize));
  return entries;
}

function guardFit(box: Box, end: number): void {
  if (end > box.end) {
    throw new MalformedBoxError(
      box.type,
      box.start,
      `lists entries that overflow its ${box.size}-byte box`,
    );
  }
}
