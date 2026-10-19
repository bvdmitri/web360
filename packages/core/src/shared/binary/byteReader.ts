/**
 * A read past the end of a {@link ByteReader}, or at an offset no byte can have.
 *
 * @remarks Carries the requested range and the reader's size, so a format reader can say which
 * structure ran short without parsing the message.
 */
export class ByteRangeError extends RangeError {
  public override readonly name = 'ByteRangeError';
  public readonly offset: number;
  public readonly length: number;
  public readonly size: number;

  public constructor(offset: number, length: number, size: number) {
    super(`bytes ${offset}..${offset + length} lie outside a ${size}-byte range`);
    this.offset = offset;
    this.length = length;
    this.size = size;
  }
}

const U16 = 2;
const U32 = 4;
const U64 = 8;

/**
 * Random-access reads of integers, floats and text from an in-memory byte range.
 *
 * Every read names its offset, relative to the start of this reader; nothing advances. Every
 * read is bounds-checked and throws {@link ByteRangeError} rather than returning a value a short
 * file did not hold.
 *
 * @remarks Only the format layer reads bytes (a dependency rule enforces it); everything else in
 * the core receives decoded values. A 64-bit read that a `number` cannot hold exactly throws
 * rather than rounding: use {@link ByteReader.u64leBig} where the full range is meaningful.
 *
 * @example
 * ```ts
 * const reader = ByteReader.of(bytes);
 * const size = reader.u32le(reader.length - 40);
 * ```
 */
export class ByteReader {
  private readonly view: DataView;

  private constructor(view: DataView) {
    this.view = view;
  }

  /** A reader over `bytes`, sharing its memory. */
  public static of(bytes: Uint8Array): ByteReader {
    return new ByteReader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }

  /** The number of bytes this reader covers. */
  public get length(): number {
    return this.view.byteLength;
  }

  public u8(offset: number): number {
    return this.view.getUint8(this.checked(offset, 1));
  }

  public u16le(offset: number): number {
    return this.view.getUint16(this.checked(offset, U16), true);
  }

  public u16be(offset: number): number {
    return this.view.getUint16(this.checked(offset, U16), false);
  }

  public i16be(offset: number): number {
    return this.view.getInt16(this.checked(offset, U16), false);
  }

  public u32le(offset: number): number {
    return this.view.getUint32(this.checked(offset, U32), true);
  }

  public u32be(offset: number): number {
    return this.view.getUint32(this.checked(offset, U32), false);
  }

  public i32le(offset: number): number {
    return this.view.getInt32(this.checked(offset, U32), true);
  }

  /** An unsigned 64-bit little-endian value; throws a `RangeError` above 2^53 - 1. */
  public u64le(offset: number): number {
    const value = this.u64leBig(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`u64 at ${offset} exceeds the exact range of a number`);
    }
    return Number(value);
  }

  public u64leBig(offset: number): bigint {
    return this.view.getBigUint64(this.checked(offset, U64), true);
  }

  public f32le(offset: number): number {
    return this.view.getFloat32(this.checked(offset, U32), true);
  }

  public f64le(offset: number): number {
    return this.view.getFloat64(this.checked(offset, U64), true);
  }

  /** `length` bytes as Latin-1 text, NUL bytes included. */
  public ascii(offset: number, length: number): string {
    return String.fromCodePoint(...this.bytes(offset, length));
  }

  /** A view of `length` bytes, sharing memory with this reader. */
  public bytes(offset: number, length: number): Uint8Array {
    const start = this.checked(offset, length);
    return new Uint8Array(this.view.buffer, this.view.byteOffset + start, length);
  }

  /** A reader over `length` bytes from `offset`, whose offsets count from that start. */
  public slice(offset: number, length: number): ByteReader {
    return ByteReader.of(this.bytes(offset, length));
  }

  private checked(offset: number, length: number): number {
    const isInRange =
      Number.isSafeInteger(offset) && offset >= 0 && offset + length <= this.view.byteLength;
    if (!isInRange) throw new ByteRangeError(offset, length, this.view.byteLength);
    return offset;
  }
}
