import type { RandomAccessSource } from '@web360/core';

/**
 * A {@link RandomAccessSource} over a `Blob` (a `File` the user picked, say): each read slices the
 * blob and reads only that slice.
 */
export function blobSource(blob: Blob): RandomAccessSource {
  return {
    size: blob.size,
    read: async (offset, length): Promise<Uint8Array> => {
      if (offset < 0 || length < 0 || offset + length > blob.size) {
        throw new RangeError(`bytes ${offset}..${offset + length} lie outside the file`);
      }
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    },
  };
}
