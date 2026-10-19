import { describe, expect, it } from 'vitest';

import { avcCodec, hevcCodec } from './codec';

describe('codec strings', () => {
  it('reads missing configuration bytes as zero', () => {
    expect(hevcCodec('hvc1', new Uint8Array())).toBe('hvc1.0.0.L0');
    expect(avcCodec('avc1', Uint8Array.from([1, 0x64]))).toBe('avc1.64');
  });
});
