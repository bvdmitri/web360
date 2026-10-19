import type { ByteReader } from '../../shared/binary/byteReader';

const FOURCC = 4;
const BOX_HEADER = 8;
const LARGESIZE_HEADER = 16;
const SIZE_TO_END = 0;
const SIZE_LARGESIZE = 1;

/**
 * A half-open byte range `[start, end)`, in offsets relative to a {@link ByteReader}.
 *
 * @remarks Boxes carry absolute offsets so a chunk offset read later (which the file states
 * against its own start) needs no translation. A region names where a walk begins and ends: the
 * whole reader for the top level, a container box's payload for its children.
 */
export interface Region {
  readonly start: number;
  readonly end: number;
}

/**
 * One ISO base media file box: its four-character type and the byte ranges it occupies.
 *
 * @remarks `start`..`end` is the whole box, header included; `payloadStart`..`end` is its content.
 * All offsets are absolute within the reader the box was read from. A container box's children are
 * walked with {@link boxesIn} over {@link payloadOf}; a leaf box's fields are read from
 * `payloadStart`.
 */
export interface Box {
  readonly type: string;
  readonly start: number;
  readonly size: number;
  readonly end: number;
  readonly payloadStart: number;
  readonly payloadSize: number;
}

/** A box read or walk that found a size no well-formed file holds. */
export class MalformedBoxError extends RangeError {
  public override readonly name = 'MalformedBoxError';
  public readonly type: string;
  public readonly start: number;

  public constructor(type: string, start: number, detail: string) {
    super(`box '${type}' at ${start} ${detail}`);
    this.type = type;
    this.start = start;
  }
}

/** The whole of `reader` as a region. */
export function regionOf(reader: ByteReader): Region {
  return { start: 0, end: reader.length };
}

/** The content of `box` as a region, for walking a container box's children. */
export function payloadOf(box: Box): Region {
  return { start: box.payloadStart, end: box.end };
}

/**
 * Reads the box whose header starts at `offset`, which must lie within `limit`.
 *
 * A size field of 1 means the real size follows as a 64-bit value (a `mdat` larger than 4 GiB);
 * a size field of 0 means the box runs to `limit` (the last box of its region). Throws
 * {@link MalformedBoxError} if the box is smaller than its header or runs past `limit`, and
 * {@link ByteRangeError} if the header itself lies outside the reader.
 */
export function readBox(reader: ByteReader, offset: number, limit: number): Box {
  const type = reader.ascii(offset + FOURCC, FOURCC);
  const { size, headerSize } = boxExtent(reader, offset, limit);
  if (size < headerSize) {
    throw new MalformedBoxError(
      type,
      offset,
      `has size ${size} below its ${headerSize}-byte header`,
    );
  }
  const end = offset + size;
  if (end > limit) {
    throw new MalformedBoxError(type, offset, `ends at ${end} past the ${limit}-byte region`);
  }
  return {
    type,
    start: offset,
    size,
    end,
    payloadStart: offset + headerSize,
    payloadSize: size - headerSize,
  };
}

/** Yields each box of `region` in file order, assuming the region holds whole boxes. */
export function* boxesIn(reader: ByteReader, region: Region): Generator<Box> {
  let offset = region.start;
  while (offset < region.end) {
    const box = readBox(reader, offset, region.end);
    yield box;
    offset = box.end;
  }
}

/** The first box of `region` whose type is `type`, or `undefined` if none is. */
export function findBox(reader: ByteReader, region: Region, type: string): Box | undefined {
  for (const box of boxesIn(reader, region)) {
    if (box.type === type) return box;
  }
  return undefined;
}

function boxExtent(
  reader: ByteReader,
  offset: number,
  limit: number,
): { size: number; headerSize: number } {
  const sizeField = reader.u32be(offset);
  if (sizeField === SIZE_LARGESIZE) {
    return { size: reader.u64be(offset + BOX_HEADER), headerSize: LARGESIZE_HEADER };
  }
  const size = sizeField === SIZE_TO_END ? limit - offset : sizeField;
  return { size, headerSize: BOX_HEADER };
}
