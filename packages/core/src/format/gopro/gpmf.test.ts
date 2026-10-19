import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { childrenOf, klvNodes } from './gpmf';

const INT16 = 0x73;
const CONTAINER = 0x00;

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const signed16be = (n: number): number[] => u16be(n & 0xff_ff);
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const pad = (length: number): number[] => zeros((4 - (length % 4)) % 4);

const klv = (key: string, spec: [number, number, number], data: number[]): number[] => {
  const [type, structSize, count] = spec;
  return [...ascii(key), type, structSize, ...u16be(count), ...data, ...pad(data.length)];
};

const reader = (bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));
const whole = (r: ByteReader): { start: number; end: number } => ({ start: 0, end: r.length });

describe('gpmf key-length-value', () => {
  it('walks a nested container down to a leaf and reads its big-endian values', () => {
    const accl = klv(
      'ACCL',
      [INT16, 6, 1],
      [...signed16be(100), ...signed16be(-200), ...signed16be(300)],
    );
    const strm = klv('STRM', [CONTAINER, 1, accl.length], accl);
    const devc = klv('DEVC', [CONTAINER, 1, strm.length], strm);
    const r = reader(devc);

    const top = klvNodes(r, whole(r));
    expect(top.map((node) => node.key)).toEqual(['DEVC']);
    const first = top[0];
    if (first === undefined) throw new Error('no DEVC node');

    const streams = childrenOf(r, first);
    expect(streams.map((node) => node.key)).toEqual(['STRM']);
    const stream = streams[0];
    if (stream === undefined) throw new Error('no STRM node');

    const leaf = childrenOf(r, stream).find((node) => node.key === 'ACCL');
    if (leaf === undefined) throw new Error('no ACCL node');
    expect(leaf).toMatchObject({ type: INT16, structSize: 6, count: 1 });
    const at = leaf.region.start;
    expect([r.i16be(at), r.i16be(at + 2), r.i16be(at + 4)]).toEqual([100, -200, 300]);
  });

  it('reads sibling leaves in order, each payload padded to four bytes', () => {
    const stnm = klv('STNM', [0x63, 1, 5], ascii('Gyro!'));
    const gyro = klv('GYRO', [INT16, 6, 1], [...signed16be(1), ...signed16be(2), ...signed16be(3)]);
    const r = reader([...stnm, ...gyro]);

    const nodes = klvNodes(r, whole(r));
    expect(nodes.map((node) => node.key)).toEqual(['STNM', 'GYRO']);
    const name = nodes[0];
    if (name === undefined) throw new Error('no STNM node');
    expect(r.ascii(name.region.start, name.count)).toBe('Gyro!');
  });
});
