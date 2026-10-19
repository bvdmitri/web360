import type { ByteReader } from '../../shared/binary/byteReader';
import type { Box } from './box';
import { readFullBox } from './fullBox';

const TIMES_V0 = 8;
const TIMES_V1 = 16;
const WIDE_VERSION = 1;
const PRE_DEFINED = 4;
const FOURCC = 4;

/**
 * The movie timescale (`mvhd`) or a media timescale (`mdhd`): the ticks per second the track's
 * sample times are counted in.
 *
 * @remarks Both headers place the timescale in the same spot, a `u32` just past the two creation
 * and modification times, whose width the box version sets (32-bit at version 0, 64-bit at
 * version 1).
 */
export function readTimescale(reader: ByteReader, box: Box): number {
  return u32AfterTimes(reader, box);
}

/** The track id of a `tkhd` box, the handle that joins a track to its sample description. */
export function readTrackId(reader: ByteReader, box: Box): number {
  return u32AfterTimes(reader, box);
}

/** The handler type of an `hdlr` box: `vide` for video, `soun` for sound, or another code. */
export function readHandlerType(reader: ByteReader, box: Box): string {
  const { fieldsStart } = readFullBox(reader, box);
  return reader.ascii(fieldsStart + PRE_DEFINED, FOURCC);
}

function u32AfterTimes(reader: ByteReader, box: Box): number {
  const { version, fieldsStart } = readFullBox(reader, box);
  return reader.u32be(fieldsStart + (version === WIDE_VERSION ? TIMES_V1 : TIMES_V0));
}
