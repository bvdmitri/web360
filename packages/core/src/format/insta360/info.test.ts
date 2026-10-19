import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readInfo } from './info';

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const f64le = (n: number): number[] => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n, true);
  return [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)];
};
const varint = (n: number): number[] => {
  const bytes: number[] = [];
  let value = n;
  do {
    const part = value & 0x7f;
    value = Math.floor(value / 128);
    bytes.push(value > 0 ? part | 0x80 : part);
  } while (value > 0);
  return bytes;
};
const tag = (field: number, wire: number): number[] => varint(field * 8 + wire);
const fVarint = (field: number, n: number): number[] => [...tag(field, 0), ...varint(n)];
const fDouble = (field: number, n: number): number[] => [...tag(field, 1), ...f64le(n)];
const fString = (field: number, text: string): number[] => [
  ...tag(field, 2),
  ...varint(text.length),
  ...ascii(text),
];
const fMessage = (field: number, content: number[]): number[] => [
  ...tag(field, 2),
  ...varint(content.length),
  ...content,
];

describe('insta360 info record', () => {
  it('reads the identity, size, timing, gyro ranges and calibration', () => {
    const message = [
      ...fString(2, 'Cam'),
      ...fString(5, '2_1_2'),
      ...fMessage(19, [...fVarint(1, 100), ...fVarint(2, 200)]),
      ...fVarint(20, 30),
      ...fVarint(24, 5000),
      ...fDouble(25, 22.5),
      ...fDouble(28, 1.5),
      ...fVarint(29, 1),
      ...fVarint(62, 1),
      ...fMessage(65, [...fVarint(1, 32), ...fVarint(2, 2000)]),
    ];
    const reader = ByteReader.of(Uint8Array.from(message));
    expect(readInfo(reader, { start: 0, end: reader.length })).toEqual({
      model: 'Cam',
      width: 100,
      height: 200,
      frameRate: 30,
      firstFrameTimestamp: 5000,
      rollingShutterMs: 22.5,
      gyroOffsetMs: 1.5,
      hasGyroOffset: true,
      rawGyro: true,
      accelerometerRange: 32,
      gyroscopeRange: 2000,
      calibration: '2_1_2',
    });
  });
});
