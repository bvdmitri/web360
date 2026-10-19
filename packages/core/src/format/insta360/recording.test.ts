import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import { readInsta360Recording } from './recording';

const MAGIC = '8db42d694ccc418790edff439fe026bf';
const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u32le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];
const footerOnly = (): number[] => [
  ...Array.from({ length: 32 }, () => 0),
  ...u32le(72),
  ...u32le(3),
  ...ascii(MAGIC),
];

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/oner-split-00.insv',
);

describe('insta360 recording', () => {
  it('refuses a recording that is missing a required record', () => {
    const reader = ByteReader.of(Uint8Array.from(footerOnly()));
    expect(() => readInsta360Recording(reader)).toThrow();
  });

  it('assembles a real ONE R recording into the vendor-neutral model', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const recording = readInsta360Recording(reader);
    expect(recording.model).toBe('Insta360 OneR');
    expect(recording.frameRate).toBe(30);
    expect(recording.frame).toEqual({ width: 2880, height: 2880 });
    expect(recording.lenses).toHaveLength(2);
    expect(recording.lenses[0]?.projection).toBe('equidistant');
    expect(recording.lenses[0]?.radius).toBeCloseTo(1476.98, 2);
    expect(recording.motion).toHaveLength(145_232);
    expect(recording.exposures).toHaveLength(4325);
    expect(recording.rollingShutter).toBeGreaterThan(0.022);
    expect(recording.rollingShutter).toBeLessThan(0.023);
    expect(recording.captureClock).toBe(3_401_538);
  });
});
