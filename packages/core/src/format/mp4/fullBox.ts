import type { ByteReader } from '../../shared/binary/byteReader';
import type { Box } from './box';

const FULLBOX_HEADER = 4;

/**
 * The version byte of a full box and where its fields begin.
 *
 * @remarks A full box (the ISO/IEC 14496-12 `FullBox`) prefixes its content with a one-byte
 * version and three flag bytes. `version` chooses the field widths of boxes that have more than
 * one form (`mdhd`, `tkhd`, `co64`); `fieldsStart` is the absolute offset just past the four
 * header bytes, where a reader begins. The flags are not interpreted here.
 */
export interface FullBox {
  readonly version: number;
  readonly fieldsStart: number;
}

/** Reads the version of `box` and the offset its fields start at. */
export function readFullBox(reader: ByteReader, box: Box): FullBox {
  return { version: reader.u8(box.payloadStart), fieldsStart: box.payloadStart + FULLBOX_HEADER };
}
