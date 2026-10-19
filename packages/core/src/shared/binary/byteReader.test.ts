import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ByteRangeError, ByteReader } from './byteReader';

const reader = (...bytes: number[]): ByteReader => ByteReader.of(Uint8Array.from(bytes));

describe('ByteReader', () => {
  it('reads unsigned integers little-endian and big-endian', () => {
    const r = reader(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x00);
    expect(r.u8(0)).toBe(0x01);
    expect(r.u16le(0)).toBe(0x02_01);
    expect(r.u16be(0)).toBe(0x01_02);
    expect(r.u32le(0)).toBe(0x04_03_02_01);
    expect(r.u32be(0)).toBe(0x01_02_03_04);
    expect(r.u64le(0)).toBe(0x07_06_05_04_03_02_01);
  });

  it('reads signed integers and floats', () => {
    expect(reader(0xff, 0xff, 0xff, 0xff).i32le(0)).toBe(-1);
    expect(reader(0xff, 0x80).i16be(0)).toBe(-128);
    expect(reader(0x80, 0x00).i16be(0)).toBe(-32_768);
    const f = new DataView(new ArrayBuffer(12));
    f.setFloat32(0, 1.5, true);
    f.setFloat64(4, -2.25, true);
    const r = ByteReader.of(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
    expect(r.f32le(0)).toBe(1.5);
    expect(r.f64le(4)).toBe(-2.25);
  });

  it('refuses a 64-bit value a number cannot hold exactly', () => {
    const r = reader(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
    expect(() => r.u64le(0)).toThrow(RangeError);
    expect(r.u64leBig(0)).toBe(0xff_ff_ff_ff_ff_ff_ff_ffn);
  });

  it('reads 2^53 - 1 exactly and refuses one more', () => {
    const view = new DataView(new ArrayBuffer(16));
    view.setBigUint64(0, BigInt(Number.MAX_SAFE_INTEGER), true);
    view.setBigUint64(8, BigInt(Number.MAX_SAFE_INTEGER) + 1n, true);
    const r = ByteReader.of(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    expect(r.u64le(0)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => r.u64le(8)).toThrow('u64 at 8 exceeds the exact range of a number');
  });

  it('reads ASCII text and stops at nothing but the length', () => {
    const r = ByteReader.of(new TextEncoder().encode('abc\0de'));
    expect(r.ascii(0, 3)).toBe('abc');
    expect(r.ascii(0, 6)).toBe('abc\0de');
  });

  it('views a sub-range without copying, with offsets relative to it', () => {
    const r = reader(9, 8, 7, 6, 5);
    const sub = r.slice(1, 3);
    expect(sub.length).toBe(3);
    expect(sub.u8(0)).toBe(8);
    expect(sub.bytes(0, 3)).toEqual(Uint8Array.of(8, 7, 6));
    expect(() => sub.u8(3)).toThrow(ByteRangeError);
  });

  it('reports the range it was asked for and the size it has', () => {
    const r = reader(1, 2, 3);
    expect(() => r.u32le(1)).toThrow(
      expect.objectContaining({ offset: 1, length: 4, size: 3 }) as Error,
    );
    expect(() => r.u32le(1)).toThrow('bytes 1..5 lie outside a 3-byte range');
    expect(() => r.u8(9)).toThrow(expect.objectContaining({ name: 'ByteRangeError' }) as Error);
    expect(() => r.u8(-1)).toThrow(ByteRangeError);
    expect(() => r.u8(0.5)).toThrow(ByteRangeError);
    expect(() => r.slice(2, 2)).toThrow(ByteRangeError);
  });

  it('agrees with DataView on every in-range read', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 8, maxLength: 64 }), fc.nat(), (bytes, seed) => {
        const offset = seed % (bytes.length - 7);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const r = ByteReader.of(bytes);
        expect(r.u16le(offset)).toBe(view.getUint16(offset, true));
        expect(r.u32be(offset)).toBe(view.getUint32(offset, false));
        expect(r.i32le(offset)).toBe(view.getInt32(offset, true));
        expect(r.u64leBig(offset)).toBe(view.getBigUint64(offset, true));
        expect(Object.is(r.f64le(offset), view.getFloat64(offset, true))).toBe(true);
      }),
    );
  });
});
