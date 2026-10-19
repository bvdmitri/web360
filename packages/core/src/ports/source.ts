/**
 * Random access to a recording's bytes, without holding them all.
 *
 * @remarks A camera file runs to gigabytes, so a reader asks only for the ranges it needs: the
 * container's box headers, its `moov`, the vendor trailer, then each sample as it is decoded. A
 * browser implements it over a `Blob` (`slice` then `arrayBuffer`), Node over a file handle, and a
 * test over bytes in memory. `read` resolves exactly `length` bytes from `offset`, or rejects when
 * the range is not inside `size`.
 */
export interface RandomAccessSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** A {@link RandomAccessSource} over bytes already in memory. */
export function memorySource(bytes: Uint8Array): RandomAccessSource {
  return {
    size: bytes.length,
    read: (offset, length) =>
      offset < 0 || length < 0 || offset + length > bytes.length
        ? Promise.reject(
            new RangeError(`bytes ${offset}..${offset + length} lie outside the source`),
          )
        : Promise.resolve(bytes.subarray(offset, offset + length)),
  };
}
