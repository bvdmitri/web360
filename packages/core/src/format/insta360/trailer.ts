import type { ByteReader } from '../../shared/binary/byteReader';
import type { Region } from '../mp4/box';

const MAGIC = '8db42d694ccc418790edff439fe026bf';
const MAGIC_SIZE = 32;
const MAGIC_FROM_EOF = 32;
const VERSION_FROM_EOF = 36;
const TRAILER_SIZE_FROM_EOF = 40;
const FOOTER_SIZE = 72;
const HEADER_SIZE = 6;
const ID_OFFSET = 1;
const SIZE_OFFSET = 2;
const INDEX_ID = 0;
const INDEX_SLOT = 10;
const SLOT_SIZE_OFFSET = 2;
const SLOT_OFFSET_OFFSET = 6;

/** One record of an Insta360 trailer: its id, its format tag and where its payload lies. */
export interface TrailerRecord {
  readonly id: number;
  readonly format: number;
  readonly region: Region;
}

/** The Insta360 trailer of a recording: its version and the records it holds. */
export interface Trailer {
  readonly version: number;
  readonly records: readonly TrailerRecord[];
}

/** A file whose trailer lacks the Insta360 magic, so it is not a recording this reads. */
export class NotInsta360Error extends Error {
  public override readonly name = 'NotInsta360Error';

  public constructor(magic: string) {
    super(`not an Insta360 recording: the trailer magic was '${magic}'`);
  }
}

/**
 * Reads the Insta360 trailer at the end of a recording.
 *
 * @remarks The trailer is found from the file's end: a 72-byte footer gives its size, version and
 * magic. The records are then either walked backward from the footer (older cameras write them
 * contiguously) or resolved through an index record, when the near-footer record is one (the X5
 * and X6). Throws {@link NotInsta360Error} when the magic is absent.
 */
export function readTrailer(reader: ByteReader): Trailer {
  const size = reader.length;
  const magic = reader.ascii(size - MAGIC_FROM_EOF, MAGIC_SIZE);
  if (magic !== MAGIC) throw new NotInsta360Error(magic);
  const version = reader.u32le(size - VERSION_FROM_EOF);
  const payloadStart = size - reader.u32le(size - TRAILER_SIZE_FROM_EOF);
  const nearFooter = size - FOOTER_SIZE - HEADER_SIZE;
  const records =
    reader.u8(nearFooter + ID_OFFSET) === INDEX_ID
      ? indexedRecords(reader, nearFooter, payloadStart)
      : contiguousRecords(reader, nearFooter, payloadStart);
  return { version, records };
}

function recordAt(reader: ByteReader, header: number): TrailerRecord {
  const format = reader.u8(header);
  const id = reader.u8(header + ID_OFFSET);
  const size = reader.u32le(header + SIZE_OFFSET);
  return { id, format, region: { start: header - size, end: header } };
}

function contiguousRecords(
  reader: ByteReader,
  nearFooter: number,
  payloadStart: number,
): TrailerRecord[] {
  const records: TrailerRecord[] = [];
  let header = nearFooter;
  while (header >= payloadStart) {
    const record = recordAt(reader, header);
    records.push(record);
    header = record.region.start - HEADER_SIZE;
  }
  return records;
}

function indexedRecords(
  reader: ByteReader,
  nearFooter: number,
  payloadStart: number,
): TrailerRecord[] {
  const index = recordAt(reader, nearFooter);
  const slots = Math.floor((index.region.end - index.region.start) / INDEX_SLOT);
  const records: TrailerRecord[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const at = index.region.start + slot * INDEX_SLOT;
    const id = reader.u8(at);
    const size = reader.u32le(at + SLOT_SIZE_OFFSET);
    if (id === INDEX_ID || size === 0) continue;
    const start = payloadStart + reader.u32le(at + SLOT_OFFSET_OFFSET);
    records.push({ id, format: reader.u8(at + ID_OFFSET), region: { start, end: start + size } });
  }
  return records;
}
