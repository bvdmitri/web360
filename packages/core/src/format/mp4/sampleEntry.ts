import type { ByteReader } from '../../shared/binary/byteReader';
import { findBox, readBox, type Box } from './box';
import { readFullBox } from './fullBox';

const ENTRY_COUNT = 4;
const SAMPLE_ENTRY_WIDTH = 24;
const SAMPLE_ENTRY_HEIGHT = 26;
const VISUAL_FIXED = 78;
const AVCC_NAL_LENGTH = 4;
const HVCC_NAL_LENGTH = 21;
const LENGTH_SIZE_BITS = 0b11;
const NO_NAL_FRAMING = 0;

/**
 * The first visual sample entry of a track's `stsd` box: its codec, coded size and NAL framing.
 *
 * @remarks `format` is the sample entry's four-character code (`hvc1`, `avc1`, ...). `width` and
 * `height` are the coded pixel dimensions. `nalLengthSize` is the bytes that prefix each NAL unit
 * in a sample, read from the `hvcC` or `avcC` config box, or 0 when the codec carries no such box.
 */
export interface VisualSampleEntry {
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly nalLengthSize: number;
}

/** The four-character format of a track's first sample entry (`hvc1`, `avc1`, `mp4a`, `gpmd`, ...). */
export function readSampleFormat(reader: ByteReader, stsd: Box): string {
  return firstEntry(reader, stsd).type;
}

/** Reads the first sample entry of a video track's `stsd` box as a visual entry. */
export function readVisualSampleEntry(reader: ByteReader, stsd: Box): VisualSampleEntry {
  const entry = firstEntry(reader, stsd);
  return {
    format: entry.type,
    width: reader.u16be(entry.payloadStart + SAMPLE_ENTRY_WIDTH),
    height: reader.u16be(entry.payloadStart + SAMPLE_ENTRY_HEIGHT),
    nalLengthSize: nalLengthSize(reader, entry),
  };
}

function firstEntry(reader: ByteReader, stsd: Box): Box {
  const { fieldsStart } = readFullBox(reader, stsd);
  return readBox(reader, fieldsStart + ENTRY_COUNT, stsd.end);
}

function nalLengthSize(reader: ByteReader, entry: Box): number {
  const region = { start: entry.payloadStart + VISUAL_FIXED, end: entry.end };
  const hvcC = findBox(reader, region, 'hvcC');
  const config = hvcC ?? findBox(reader, region, 'avcC');
  if (config === undefined) return NO_NAL_FRAMING;
  const offset = hvcC === undefined ? AVCC_NAL_LENGTH : HVCC_NAL_LENGTH;
  return (reader.u8(config.payloadStart + offset) & LENGTH_SIZE_BITS) + 1;
}
