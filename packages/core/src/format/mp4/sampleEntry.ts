import type { ByteReader } from '../../shared/binary/byteReader';
import { findBox, readBox, type Box } from './box';
import { avcCodec, hevcCodec } from './codec';
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
 * `codec` is the full codec string a decoder is configured with (`avc1.4d4034`), and
 * `decoderConfig` is that config box's payload, the decoder's description; without a config box the
 * codec is the bare format and the configuration is empty.
 */
export interface VisualSampleEntry {
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly nalLengthSize: number;
  readonly codec: string;
  readonly decoderConfig: Uint8Array;
}

/** The four-character format of a track's first sample entry (`hvc1`, `avc1`, `mp4a`, `gpmd`, ...). */
export function readSampleFormat(reader: ByteReader, stsd: Box): string {
  return firstEntry(reader, stsd).type;
}

/** Reads the first sample entry of a video track's `stsd` box as a visual entry. */
export function readVisualSampleEntry(reader: ByteReader, stsd: Box): VisualSampleEntry {
  const entry = firstEntry(reader, stsd);
  const config = configOf(reader, entry);
  const decoderConfig =
    config === undefined
      ? new Uint8Array()
      : Uint8Array.from(reader.bytes(config.payloadStart, config.payloadSize));
  return {
    format: entry.type,
    width: reader.u16be(entry.payloadStart + SAMPLE_ENTRY_WIDTH),
    height: reader.u16be(entry.payloadStart + SAMPLE_ENTRY_HEIGHT),
    nalLengthSize: nalLengthSize(reader, config),
    codec: codecOf(entry.type, config, decoderConfig),
    decoderConfig,
  };
}

function configOf(reader: ByteReader, entry: Box): Box | undefined {
  const region = { start: entry.payloadStart + VISUAL_FIXED, end: entry.end };
  return findBox(reader, region, 'hvcC') ?? findBox(reader, region, 'avcC');
}

function codecOf(format: string, config: Box | undefined, bytes: Uint8Array): string {
  if (config === undefined) return format;
  return config.type === 'hvcC' ? hevcCodec(format, bytes) : avcCodec(format, bytes);
}

function firstEntry(reader: ByteReader, stsd: Box): Box {
  const { fieldsStart } = readFullBox(reader, stsd);
  return readBox(reader, fieldsStart + ENTRY_COUNT, stsd.end);
}

function nalLengthSize(reader: ByteReader, config: Box | undefined): number {
  if (config === undefined) return NO_NAL_FRAMING;
  const offset = config.type === 'hvcC' ? HVCC_NAL_LENGTH : AVCC_NAL_LENGTH;
  return (reader.u8(config.payloadStart + offset) & LENGTH_SIZE_BITS) + 1;
}
