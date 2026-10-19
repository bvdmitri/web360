import { describe, expect, it } from 'vitest';

import { blobSource } from './blob';

describe('blob source', () => {
  const source = blobSource(new Blob([Uint8Array.from([1, 2, 3, 4, 5])]));

  it('reads the slice asked for', async () => {
    expect(source.size).toBe(5);
    expect([...(await source.read(1, 3))]).toEqual([2, 3, 4]);
  });

  it('refuses a range outside the blob', async () => {
    await expect(source.read(4, 2)).rejects.toThrow(RangeError);
    await expect(source.read(-1, 1)).rejects.toThrow(RangeError);
    await expect(source.read(0, -1)).rejects.toThrow(RangeError);
  });
});
