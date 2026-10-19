import type { RandomAccessSource } from '../../ports/source';
import { ByteReader } from '../../shared/binary/byteReader';
import { readBox } from './box';
import { readMovie, UnsupportedContainerError, type Movie } from './movie';

const HEADER = 8;
const LARGE_HEADER = 16;
const FOURCC = 4;
const LARGE_SIZE = 1;
const TO_END = 0;
const MOOV = 'moov';

interface TopLevelBox {
  readonly type: string;
  readonly start: number;
  readonly size: number;
}

/**
 * Reads the movie of an ISO base media file from a source, reading only box headers and the
 * `moov` box.
 *
 * @remarks The top-level boxes are walked by their headers (a 64-bit size for a large `mdat`, a
 * zero size for a box that runs to the end), so the media data is never read, wherever the `moov`
 * sits. Sample offsets in the movie stay absolute in the file, ready to read samples from the same
 * source. Throws {@link UnsupportedContainerError} for a file with no `moov` or a malformed header.
 */
export async function readMovieFrom(source: RandomAccessSource): Promise<Movie> {
  const moov = await findTopLevel(source, MOOV);
  const reader = ByteReader.of(await source.read(moov.start, moov.size));
  return readMovie(reader, readBox(reader, 0, moov.size));
}

async function findTopLevel(source: RandomAccessSource, type: string): Promise<TopLevelBox> {
  let offset = 0;
  while (offset + HEADER <= source.size) {
    const box = await headerAt(source, offset);
    if (box.type === type) return box;
    offset += box.size;
  }
  throw new UnsupportedContainerError(`a ${type} box is missing`);
}

async function headerAt(source: RandomAccessSource, offset: number): Promise<TopLevelBox> {
  const length = Math.min(LARGE_HEADER, source.size - offset);
  const header = ByteReader.of(await source.read(offset, length));
  const type = header.ascii(FOURCC, FOURCC);
  const declared = header.u32be(0);
  const size = sizeOf({ header, declared, rest: source.size - offset });
  if (size < HEADER) {
    throw new UnsupportedContainerError(`the ${type} box at ${offset} is smaller than its header`);
  }
  return { type, start: offset, size };
}

function sizeOf(box: { header: ByteReader; declared: number; rest: number }): number {
  if (box.declared === LARGE_SIZE) return box.header.u64be(HEADER);
  return box.declared === TO_END ? box.rest : box.declared;
}
