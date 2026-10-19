import type { ByteReader } from '../../shared/binary/byteReader';
import type { Region } from '../mp4/box';

const HEADER = 8;
const FOURCC = 4;
const TYPE_OFFSET = 4;
const STRUCT_OFFSET = 5;
const COUNT_OFFSET = 6;
const ALIGN = 4;

/**
 * One GPMF node: a four-character key, its value type and dimensions, and where its payload lies.
 *
 * @remarks GPMF (GoPro's telemetry format) is key-length-value: a four-byte key, a one-byte type,
 * a one-byte structure size, a two-byte repeat count, then the payload padded to four bytes. A
 * type of 0 marks a nested container (`DEVC`, `STRM`) whose payload is more nodes
 * ({@link childrenOf}). All GPMF values are big-endian.
 */
export interface KlvNode {
  readonly key: string;
  readonly type: number;
  readonly structSize: number;
  readonly count: number;
  readonly region: Region;
}

/** The GPMF nodes directly within `region`, in order. */
export function klvNodes(reader: ByteReader, region: Region): KlvNode[] {
  const nodes: KlvNode[] = [];
  let at = region.start;
  while (at + HEADER <= region.end) {
    const structSize = reader.u8(at + STRUCT_OFFSET);
    const count = reader.u16be(at + COUNT_OFFSET);
    const start = at + HEADER;
    const length = structSize * count;
    nodes.push({
      key: reader.ascii(at, FOURCC),
      type: reader.u8(at + TYPE_OFFSET),
      structSize,
      count,
      region: { start, end: start + length },
    });
    at = start + length + ((ALIGN - (length % ALIGN)) % ALIGN);
  }
  return nodes;
}

/** The GPMF nodes nested inside a container node (`DEVC`, `STRM`, ...). */
export function childrenOf(reader: ByteReader, node: KlvNode): KlvNode[] {
  return klvNodes(reader, node.region);
}
