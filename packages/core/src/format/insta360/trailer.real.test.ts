import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readTrailer } from './trailer';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('insta360 trailer, on a real ONE R recording', () => {
  it('finds every record and no GPS', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const trailer = readTrailer(reader);
    expect(trailer.version).toBe(3);
    expect(trailer.records.map((rec) => rec.id).toSorted((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 9, 10, 11, 12,
    ]);
    const info = trailer.records.find((rec) => rec.id === 1);
    expect(info).toBeDefined();
    expect(info!.region.end - info!.region.start).toBe(419);
  });
});
