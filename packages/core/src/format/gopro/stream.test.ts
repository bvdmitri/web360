import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { klvNodes } from './gpmf';
import { readStream, UnsupportedStreamError } from './stream';

const INT16 = 0x73;
const INT32 = 0x6c;
const FLOAT = 0x66;
const CHAR = 0x63;
const UINT64 = 0x4a;
const CONTAINER = 0x00;

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const signed16be = (n: number): number[] => u16be(n & 0xff_ff);
const u64be = (n: number): number[] => [
  ...u16be(0),
  ...u16be(0),
  ...u16be((n >>> 16) & 0xff_ff),
  ...u16be(n & 0xff_ff),
];
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const pad = (length: number): number[] => zeros((4 - (length % 4)) % 4);

const klv = (key: string, spec: [number, number, number], data: number[]): number[] => {
  const [type, structSize, count] = spec;
  return [...ascii(key), type, structSize, ...u16be(count), ...data, ...pad(data.length)];
};

const stmp = (micros: number): number[] => klv('STMP', [UINT64, 8, 1], u64be(micros));
const stnm = (name: string): number[] => klv('STNM', [CHAR, name.length, 1], ascii(name));
const siun = (unit: string): number[] => klv('SIUN', [CHAR, unit.length, 1], ascii(unit));
const orin = (order: string): number[] => klv('ORIN', [CHAR, order.length, 1], ascii(order));
const scal = (divisors: number[]): number[] =>
  klv(
    'SCAL',
    [INT16, 2, divisors.length],
    divisors.flatMap((d) => signed16be(d)),
  );
const triples = (key: string, rows: number[][]): number[] =>
  klv(
    key,
    [INT16, 6, rows.length],
    rows.flatMap((row) => row.flatMap((n) => signed16be(n))),
  );

const strm = (children: number[]): number[] =>
  klv('STRM', [CONTAINER, 1, children.length], children);
const decode = (bytes: number[]): ReturnType<typeof readStream> => {
  const reader = ByteReader.of(Uint8Array.from(bytes));
  const [node] = klvNodes(reader, { start: 0, end: reader.length });
  if (node === undefined) throw new Error('no STRM node');
  return readStream(reader, node);
};

describe('gpmf stream decode', () => {
  it('scales each component by a single broadcast divisor and reads the labels', () => {
    const result = decode(
      strm([
        ...stmp(1000),
        ...stnm('Gyroscope'),
        ...siun('rad/s'),
        ...orin('ZXY'),
        ...scal([10]),
        ...triples('GYRO', [
          [100, -200, 300],
          [400, 500, -600],
        ]),
      ]),
    );

    expect(result).toEqual({
      name: 'Gyroscope',
      unit: 'rad/s',
      orientation: 'ZXY',
      startTime: 1000,
      samples: [
        [10, -20, 30],
        [40, 50, -60],
      ],
    });
  });

  it('scales each component by its own divisor when SCAL names one per axis', () => {
    const result = decode(strm([...scal([2, 4, 5]), ...triples('ACCL', [[10, 20, 30]])]));
    expect(result.samples).toEqual([[5, 5, 6]]);
  });

  it('reads an empty label and a zero start time when those boxes are absent', () => {
    const result = decode(strm([...scal([1]), ...triples('GYRO', [[1, 2, 3]])]));
    expect(result).toMatchObject({ name: '', unit: '', orientation: '', startTime: 0 });
  });

  it('refuses a stream with no data leaf', () => {
    expect(() => decode(strm([]))).toThrow(UnsupportedStreamError);
  });

  it('refuses a data leaf that is not int16', () => {
    const floatLeaf = klv('SHUT', [FLOAT, 4, 1], zeros(4));
    expect(() => decode(strm([...scal([1]), ...floatLeaf]))).toThrow(UnsupportedStreamError);
  });

  it('refuses a stream without SCAL', () => {
    expect(() => decode(strm([...triples('GYRO', [[1, 2, 3]])]))).toThrow(UnsupportedStreamError);
  });

  it('refuses a SCAL that is not int16', () => {
    const wideScale = klv('SCAL', [INT32, 4, 1], zeros(4));
    expect(() => decode(strm([...wideScale, ...triples('GYRO', [[1, 2, 3]])]))).toThrow(
      UnsupportedStreamError,
    );
  });

  it('refuses a SCAL with too few values for the components', () => {
    expect(() => decode(strm([...scal([2, 3]), ...triples('GYRO', [[1, 2, 3]])]))).toThrow(
      UnsupportedStreamError,
    );
  });
});
