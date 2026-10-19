import type { ByteReader } from '../../shared/binary/byteReader';
import { childrenOf, type KlvNode } from './gpmf';

const INT16 = 0x73;
const INT16_BYTES = 2;

/**
 * One GPMF sensor stream decoded into physical units: its samples, labels and block start time.
 *
 * @remarks A GoPro `STRM` carries sticky metadata (`STNM` name, `SIUN` unit, `ORIN` axis order,
 * `SCAL` divisor, `STMP` start time) followed by a single data leaf, which is always the last
 * child. Each raw integer component is divided by its `SCAL` divisor to reach the unit named by
 * `SIUN`. The samples are evenly spaced across the stream's payload window; this decoder reports
 * their count and the block's {@link GpmfStream.startTime}, and the assembler spaces them using the
 * container's sample duration. Axis order (`ORIN`) is reported, not applied: remapping to a
 * reference frame belongs to the model, not the byte reader.
 *
 * @see {@link readStream}
 */
export interface GpmfStream {
  readonly name: string;
  readonly unit: string;
  readonly orientation: string;
  readonly startTime: number;
  readonly samples: readonly (readonly number[])[];
}

/** A GPMF stream web360 does not decode, such as a non-integer sensor stream or one without scale. */
export class UnsupportedStreamError extends Error {
  public override readonly name = 'UnsupportedStreamError';
}

/**
 * Decodes a GPMF `STRM` node into its samples in physical units.
 *
 * @remarks Supports the signed-16-bit sensor streams (`GYRO`, `ACCL`, `MAGN`); a stream whose data
 * leaf or `SCAL` is some other type throws {@link UnsupportedStreamError} rather than misreading
 * its bytes. Absent labels read as the empty string and an absent `STMP` as `0`.
 */
export function readStream(reader: ByteReader, strm: KlvNode): GpmfStream {
  const children = childrenOf(reader, strm);
  const data = children.at(-1);
  if (data === undefined) throw new UnsupportedStreamError('the stream has no data leaf');
  if (data.type !== INT16) throw new UnsupportedStreamError(`the ${data.key} stream is not int16`);
  return {
    name: labelOf(reader, children, 'STNM'),
    unit: labelOf(reader, children, 'SIUN'),
    orientation: labelOf(reader, children, 'ORIN'),
    startTime: startTimeOf(reader, children),
    samples: scaledSamples(reader, data, scaleDivisors(reader, children)),
  };
}

function scaledSamples(reader: ByteReader, leaf: KlvNode, divisors: number[]): number[][] {
  const components = leaf.structSize / INT16_BYTES;
  const rows: number[][] = [];
  for (let sample = 0; sample < leaf.count; sample += 1) {
    const base = leaf.region.start + sample * leaf.structSize;
    const row: number[] = [];
    for (let axis = 0; axis < components; axis += 1) {
      row.push(reader.i16be(base + axis * INT16_BYTES) / scaleAt(divisors, axis));
    }
    rows.push(row);
  }
  return rows;
}

function scaleAt(divisors: number[], axis: number): number {
  const value = divisors.length === 1 ? divisors[0] : divisors[axis];
  if (value === undefined) {
    throw new UnsupportedStreamError('SCAL has too few values for the data components');
  }
  return value;
}

function scaleDivisors(reader: ByteReader, children: KlvNode[]): number[] {
  const scal = children.find((node) => node.key === 'SCAL');
  if (scal === undefined) throw new UnsupportedStreamError('the stream has no SCAL');
  if (scal.type !== INT16) throw new UnsupportedStreamError('the SCAL is not int16');
  const out: number[] = [];
  for (let index = 0; index < scal.count; index += 1) {
    out.push(reader.i16be(scal.region.start + index * INT16_BYTES));
  }
  return out;
}

function startTimeOf(reader: ByteReader, children: KlvNode[]): number {
  const stmp = children.find((node) => node.key === 'STMP');
  return stmp === undefined ? 0 : reader.u64be(stmp.region.start);
}

function labelOf(reader: ByteReader, children: KlvNode[], key: string): string {
  const node = children.find((entry) => entry.key === key);
  return node === undefined
    ? ''
    : reader
        .ascii(node.region.start, node.region.end - node.region.start)
        .replaceAll('\u{0000}', '');
}
