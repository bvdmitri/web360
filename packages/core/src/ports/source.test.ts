import { describe, expect, it } from 'vitest';

import { memorySource } from './source';

describe('memory source', () => {
  const source = memorySource(new Uint8Array([1, 2, 3, 4, 5]));

  it('reads the range asked for', async () => {
    expect(source.size).toBe(5);
    expect([...(await source.read(1, 3))]).toEqual([2, 3, 4]);
    expect([...(await source.read(5, 0))]).toEqual([]);
  });

  it('refuses a range outside the bytes', async () => {
    await expect(source.read(3, 3)).rejects.toThrow(RangeError);
    await expect(source.read(-1, 1)).rejects.toThrow(RangeError);
    await expect(source.read(0, -1)).rejects.toThrow(RangeError);
  });
});
