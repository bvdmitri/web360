import type { ByteReader } from '../../shared/binary/byteReader';
import { boxesIn, findBox, payloadOf, type Box, type Region } from './box';
import { readHandlerType, readTimescale, readTrackId } from './movieHeader';
import { readVisualSampleEntry, type VisualSampleEntry } from './sampleEntry';
import {
  readChunkOffsets32,
  readChunkOffsets64,
  readCompositionOffsets,
  readSampleSizes,
  readSampleToChunk,
  readSyncSamples,
  readTimeToSample,
} from './sampleTable';
import { buildSamples, type Sample, type SampleTables } from './timeline';

const TRAK = 'trak';
const MVEX = 'mvex';
const VIDEO_HANDLER = 'vide';

/**
 * A decoded track: its id, what it carries, its clock, its codec and its sample tables.
 *
 * @remarks The samples are not expanded here; {@link samplesOf} places and times them on demand.
 * Reading the tables is cheap even for a track of many samples (a long audio track), so a reader
 * materialises only the tracks it needs rather than every track of a movie.
 */
export interface Track {
  readonly id: number;
  readonly handler: string;
  readonly timescale: number;
  readonly sampleEntry: VisualSampleEntry | undefined;
  readonly tables: SampleTables;
}

/** A decoded movie: the movie timescale and the tracks it holds. */
export interface Movie {
  readonly timescale: number;
  readonly tracks: readonly Track[];
}

/** A container web360 does not read, such as a fragmented file or one missing a required box. */
export class UnsupportedContainerError extends Error {
  public override readonly name = 'UnsupportedContainerError';
}

/**
 * Reads a `moov` box into a {@link Movie}.
 *
 * @remarks Each track is placed and timed on its own media clock (see {@link buildSamples}); the
 * edit list is not applied here. A fragmented file, whose `moov` carries `mvex`, is refused, as no
 * camera writes one.
 */
export function readMovie(reader: ByteReader, moov: Box): Movie {
  const region = payloadOf(moov);
  if (findBox(reader, region, MVEX) !== undefined) {
    throw new UnsupportedContainerError('a fragmented file is not supported');
  }
  return {
    timescale: readTimescale(reader, mustFind(reader, region, 'mvhd')),
    tracks: tracksIn(reader, region),
  };
}

function tracksIn(reader: ByteReader, region: Region): Track[] {
  const tracks: Track[] = [];
  for (const box of boxesIn(reader, region)) {
    if (box.type === TRAK) tracks.push(readTrack(reader, box));
  }
  return tracks;
}

function readTrack(reader: ByteReader, trak: Box): Track {
  const trakRegion = payloadOf(trak);
  const mdia = payloadOf(mustFind(reader, trakRegion, 'mdia'));
  const minf = payloadOf(mustFind(reader, mdia, 'minf'));
  const stbl = mustFind(reader, minf, 'stbl');
  const handler = readHandlerType(reader, mustFind(reader, mdia, 'hdlr'));
  return {
    id: readTrackId(reader, mustFind(reader, trakRegion, 'tkhd')),
    handler,
    timescale: readTimescale(reader, mustFind(reader, mdia, 'mdhd')),
    sampleEntry: videoEntry(reader, handler, stbl),
    tables: readSampleTables(reader, stbl),
  };
}

/** Places and times a track's samples on its media clock, expanded on demand. */
export function samplesOf(track: Track): Sample[] {
  return buildSamples(track.tables);
}

function videoEntry(reader: ByteReader, handler: string, stbl: Box): VisualSampleEntry | undefined {
  return handler === VIDEO_HANDLER
    ? readVisualSampleEntry(reader, mustFind(reader, payloadOf(stbl), 'stsd'))
    : undefined;
}

function readSampleTables(reader: ByteReader, stbl: Box): SampleTables {
  const region = payloadOf(stbl);
  const ctts = findBox(reader, region, 'ctts');
  const stss = findBox(reader, region, 'stss');
  return {
    times: readTimeToSample(reader, mustFind(reader, region, 'stts')),
    compositionOffsets: ctts === undefined ? [] : readCompositionOffsets(reader, ctts),
    syncSamples: stss === undefined ? [] : readSyncSamples(reader, stss),
    sizes: readSampleSizes(reader, mustFind(reader, region, 'stsz')),
    sampleToChunk: readSampleToChunk(reader, mustFind(reader, region, 'stsc')),
    chunkOffsets: chunkOffsets(reader, region),
  };
}

function chunkOffsets(reader: ByteReader, region: Region): number[] {
  const stco = findBox(reader, region, 'stco');
  return stco === undefined
    ? readChunkOffsets64(reader, mustFind(reader, region, 'co64'))
    : readChunkOffsets32(reader, stco);
}

function mustFind(reader: ByteReader, region: Region, type: string): Box {
  const found = findBox(reader, region, type);
  if (found === undefined) throw new UnsupportedContainerError(`a ${type} box is missing`);
  return found;
}
