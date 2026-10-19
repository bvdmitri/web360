import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import {
  byNumber,
  doubleOf,
  readVarint,
  scanMessage,
  stringOf,
  submessageOf,
  varintOf,
} from './protobuf';

const f64le = (n: number): number[] => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n, true);
  return [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)];
};
const reader = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));
const whole = (r: ByteReader): { start: number; end: number } => ({ start: 0, end: r.length });

describe('protobuf', () => {
  it('decodes a multi-byte varint and reports where it ends', () => {
    expect(readVarint(reader(0x96, 0x01), 0)).toEqual({ value: 150, next: 2 });
    expect(readVarint(reader(0xac, 0x02), 0)).toEqual({ value: 300, next: 2 });
    expect(readVarint(reader(0x07), 0)).toEqual({ value: 7, next: 1 });
  });

  it('scans varint, string, fixed64 and nested-message fields', () => {
    const r = reader(
      0x08,
      0x96,
      0x01, // field 1, varint 150
      0x12,
      0x02,
      0x68,
      0x69, // field 2, string "hi"
      0x19,
      ...f64le(1.5), // field 3, fixed64 1.5
      0x22,
      0x02,
      0x08,
      0x07, // field 4, message { field 1: 7 }
    );
    const fields = byNumber(scanMessage(r, whole(r)));
    expect(fields.get(1)?.value).toBe(150);

    const text = fields.get(2);
    expect(text && r.ascii(text.region.start, text.region.end - text.region.start)).toBe('hi');

    const dbl = fields.get(3);
    expect(dbl && r.f64le(dbl.region.start)).toBe(1.5);

    const nested = fields.get(4);
    expect(nested).toBeDefined();
    expect(byNumber(scanMessage(r, nested!.region)).get(1)?.value).toBe(7);
  });

  it('reports an absent field as empty', () => {
    const r = reader(0x08, 0x05);
    const fields = byNumber(scanMessage(r, whole(r)));
    expect(varintOf(fields, 99)).toBe(0);
    expect(doubleOf(r, fields, 99)).toBe(0);
    expect(stringOf(r, fields, 99)).toBe('');
    expect(submessageOf(r, fields, 99).size).toBe(0);
  });
});
