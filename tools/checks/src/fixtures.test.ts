import { describe, expect, it } from 'vitest';

import { fixtureProblems, personalData, scrubbed } from './fixtures.ts';

const ascii = (text: string): number[] => Array.from(text, (letter) => letter.codePointAt(0) ?? 0);

// A GPMF record: key, type, structure size, repeat (big-endian), then the payload padded to four.
const record = (key: string, type: string, payload: readonly number[]): number[] => {
  const padded = [...payload, ...Array.from({ length: (4 - (payload.length % 4)) % 4 }, () => 0)];
  return [...ascii(key), type.codePointAt(0) ?? 0, 1, 0, payload.length, ...padded];
};

// An ISO base media box: a big-endian size, the type, the payload.
const box = (type: string, payload: readonly number[]): number[] => {
  const size = payload.length + 8;
  return [0, 0, size >> 8, size & 0xff, ...ascii(type), ...payload];
};

const file = (parts: readonly number[][]): Uint8Array => Uint8Array.from(parts.flat());

describe('personal data in a GoPro fixture', () => {
  it('finds a serial number, face boxes and a camera hash', () => {
    const bytes = file([
      record('DVNM', 'c', ascii('MAX2')),
      record('CASN', 'c', ascii('C3000000000000')),
      record('FACE', '?', [0, 1, 2, 3]),
      box('CAME', [9, 9, 9, 9]),
    ]);
    expect(personalData(bytes).map((one) => one.key)).toEqual(['CASN', 'FACE', 'CAME']);
  });

  it('passes records and boxes already zeroed, and the camera model', () => {
    const bytes = file([
      record('DVNM', 'c', ascii('MAX2')),
      record('CASN', 'c', [0, 0, 0, 0, 0, 0]),
      record('GPS9', '?', [0, 0, 0, 0]),
      box('GUMI', [0, 0, 0, 0]),
    ]);
    expect(personalData(bytes)).toEqual([]);
  });

  it('zeroes every personal payload and nothing else, keeping the file the same size', () => {
    const bytes = file([
      record('DVNM', 'c', ascii('MAX2')),
      record('CDAT', 'J', [1, 2, 3, 4, 5, 6, 7, 8]),
      box('MUID', [5, 6, 7, 8]),
    ]);
    const clean = scrubbed(bytes);
    expect(clean).toHaveLength(bytes.length);
    expect(personalData(clean)).toEqual([]);
    expect([...clean.subarray(8, 12)]).toEqual(ascii('MAX2'));
    // The original is left as it was.
    expect(personalData(bytes).map((one) => one.key)).toEqual(['CDAT', 'MUID']);
  });

  it('reports each personal payload of a GoPro fixture as a problem, and nothing for other files', () => {
    const bytes = file([record('CASN', 'c', ascii('C3000000000000'))]);
    expect(fixtureProblems('test/fixtures/gopro/a.360', bytes)).toEqual([
      {
        path: 'test/fixtures/gopro/a.360',
        line: 0,
        rule: 'personal-data',
        detail: 'CASN at byte 8',
      },
    ]);
    expect(fixtureProblems('test/fixtures/gopro/a.360', scrubbed(bytes))).toEqual([]);
    expect(fixtureProblems('README.md', bytes)).toEqual([]);
  });

  it('reads neither a key without a record header after it, nor one with no box size before it', () => {
    // A known key followed by a byte that is no GPMF type, at the very start of the file.
    const bytes = Uint8Array.from([...ascii('CASN'), 1, 1, 0, 4, 9, 9, 9, 9]);
    expect(personalData(bytes)).toEqual([]);
  });

  it('reads no record that would run past the end of the file', () => {
    const bytes = Uint8Array.from([
      0,
      0,
      0,
      0,
      ...ascii('CASN'),
      'c'.codePointAt(0) ?? 0,
      1,
      0,
      200,
    ]);
    expect(personalData(bytes)).toEqual([]);
  });
});
