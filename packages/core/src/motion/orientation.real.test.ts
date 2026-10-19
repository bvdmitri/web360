import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readInsta360Recording } from '../format/insta360/recording';
import { ByteReader } from '../shared/binary/byteReader';
import { identity, type Quaternion } from '../shared/math/quaternion';
import { integrateOrientation } from './orientation';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/insta360/oner-split-00.insv',
);

const magnitude = (q: Quaternion): number => Math.hypot(q.w, q.x, q.y, q.z);

describe('integrate orientation, on a real ONE R recording', () => {
  it('integrates the whole gyro track into a unit-quaternion attitude per sample', () => {
    const reader = ByteReader.of(new Uint8Array(readFileSync(fixture)));
    const recording = readInsta360Recording(reader);

    const orientation = integrateOrientation(recording.angularVelocity);

    expect(orientation).toHaveLength(recording.angularVelocity.length);
    expect(orientation[0]?.orientation).toEqual(identity());
    expect(orientation.every((sample) => Math.abs(magnitude(sample.orientation) - 1) < 1e-6)).toBe(
      true,
    );
  });
});
