import type { ByteReader } from '../../shared/binary/byteReader';
import type { Region } from '../mp4/box';

const WIRE_MASK = 0x7;
const TAG_SHIFT = 3;
const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH = 2;
const WIRE_FIXED32 = 5;
const FIXED64_SIZE = 8;
const FIXED32_SIZE = 4;
const CONTINUE_BIT = 0x80;
const PAYLOAD_MASK = 0x7f;
const PAYLOAD_BITS = 7;
const MAX_VARINT_BYTES = 10;

/**
 * One field of a protobuf message: its number, its wire type, and where its value lies.
 *
 * @remarks `value` holds a varint field's decoded number (zero for other wire types). `region`
 * is the field's value bytes: the varint bytes, the eight or four bytes of a fixed field, or the
 * content of a length-delimited field (a string, bytes, or a nested message to scan again).
 */
export interface WireField {
  readonly field: number;
  readonly wire: number;
  readonly value: number;
  readonly region: Region;
}

/** Decodes a base-128 varint at `offset`, returning its value and the offset just past it. */
export function readVarint(reader: ByteReader, offset: number): { value: number; next: number } {
  let value = 0;
  for (let step = 0; step < MAX_VARINT_BYTES; step += 1) {
    const byte = reader.u8(offset + step);
    value += (byte & PAYLOAD_MASK) * 2 ** (step * PAYLOAD_BITS);
    if ((byte & CONTINUE_BIT) === 0) return { value, next: offset + step + 1 };
  }
  throw new RangeError(`varint at ${offset} runs longer than ${MAX_VARINT_BYTES} bytes`);
}

/** Scans every top-level field of the message in `region`, in order. */
export function scanMessage(reader: ByteReader, region: Region): WireField[] {
  const fields: WireField[] = [];
  let at = region.start;
  while (at < region.end) {
    const tag = readVarint(reader, at);
    const read = readField(reader, tag.value & WIRE_MASK, tag.next);
    fields.push({
      field: tag.value >>> TAG_SHIFT,
      wire: tag.value & WIRE_MASK,
      value: read.value,
      region: { start: read.contentStart, end: read.next },
    });
    at = read.next;
  }
  return fields;
}

/** Indexes fields by number, keeping the last where a number repeats. */
export function byNumber(fields: readonly WireField[]): Map<number, WireField> {
  const map = new Map<number, WireField>();
  for (const entry of fields) map.set(entry.field, entry);
  return map;
}

/** The decoded number of varint field `field`, or 0 when it is absent. */
export function varintOf(fields: Map<number, WireField>, field: number): number {
  return fields.get(field)?.value ?? 0;
}

/** The IEEE-754 double of fixed64 field `field`, or 0 when it is absent. */
export function doubleOf(
  reader: ByteReader,
  fields: Map<number, WireField>,
  field: number,
): number {
  const found = fields.get(field);
  return found === undefined ? 0 : reader.f64le(found.region.start);
}

/** The text of length-delimited field `field`, or an empty string when it is absent. */
export function stringOf(
  reader: ByteReader,
  fields: Map<number, WireField>,
  field: number,
): string {
  const found = fields.get(field);
  return found === undefined
    ? ''
    : reader.ascii(found.region.start, found.region.end - found.region.start);
}

/** The fields of the nested message in field `field`, or an empty map when it is absent. */
export function submessageOf(
  reader: ByteReader,
  fields: Map<number, WireField>,
  field: number,
): Map<number, WireField> {
  const found = fields.get(field);
  return found === undefined
    ? new Map<number, WireField>()
    : byNumber(scanMessage(reader, found.region));
}

function readField(
  reader: ByteReader,
  wire: number,
  at: number,
): { value: number; contentStart: number; next: number } {
  switch (wire) {
    case WIRE_VARINT: {
      const varint = readVarint(reader, at);
      return { value: varint.value, contentStart: at, next: varint.next };
    }
    case WIRE_FIXED64: {
      return { value: 0, contentStart: at, next: at + FIXED64_SIZE };
    }
    case WIRE_FIXED32: {
      return { value: 0, contentStart: at, next: at + FIXED32_SIZE };
    }
    case WIRE_LENGTH: {
      const length = readVarint(reader, at);
      return { value: 0, contentStart: length.next, next: length.next + length.value };
    }
    default: {
      throw new RangeError(`unsupported protobuf wire type ${wire}`);
    }
  }
}
