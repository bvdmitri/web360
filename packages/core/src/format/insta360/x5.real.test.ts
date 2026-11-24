import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { lensPose } from '../../optics/lens';
import { memorySource } from '../../ports/source';
import { ByteReader } from '../../shared/binary/byteReader';
import { rotate, type Vector3 } from '../../shared/math/quaternion';
import { readInfo } from './info';
import { openInsta360 } from './open';
import { readInsta360Recording } from './recording';
import { readTrailer } from './trailer';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/insta360/x5-single-00.insv',
);
const bytes = new Uint8Array(readFileSync(fixture));
const OPTICAL_AXIS: Vector3 = [0, 0, 1];

describe('insta360 X5, on a real single-file recording', () => {
  it('reads the indexed trailer and the info record', () => {
    const reader = ByteReader.of(bytes);
    const trailer = readTrailer(reader);
    expect(trailer.records.map((rec) => rec.id).toSorted((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 9, 10, 11, 22, 28, 29,
    ]);
    const record = trailer.records.find((rec) => rec.id === 1);
    if (record === undefined) throw new Error('the fixture has no info record');
    const info = readInfo(reader, record.region);
    expect(info.model).toBe('Insta360 X5');
    expect([info.width, info.height]).toEqual([3840, 3840]);
    expect(info.rollingShutterMs).toBeCloseTo(21.24, 2);
  });

  it('opens one lens from each of its two tracks', async () => {
    const opened = await openInsta360({ primary: memorySource(bytes) });
    expect(opened.videos).toHaveLength(2);
    expect(opened.canvas).toEqual([10_752, 5376]);
    expect(opened.images.map((image) => image.texture)).toEqual([0, 1]);
  });

  it('points its two lenses in opposite directions', () => {
    const recording = readInsta360Recording(ByteReader.of(bytes));
    const [front, back] = recording.lenses.map((lens) =>
      rotate(lensPose(lens.orientation), OPTICAL_AXIS),
    );
    if (front === undefined || back === undefined) throw new Error('the X5 has two lenses');
    const facing = front[0] * back[0] + front[1] * back[1] + front[2] * back[2];
    expect(facing).toBeLessThan(-0.99);
  });

  it('aligns its IMU a quarter turn about the lens axis from the ONE R', () => {
    const { imuToCamera } = readInsta360Recording(ByteReader.of(bytes));
    const along = (axis: Vector3): number[] =>
      rotate(imuToCamera, axis).map((component) => Math.round(component) + 0);
    expect(along([1, 0, 0])).toEqual([0, 1, 0]);
    expect(along([0, 1, 0])).toEqual([0, 0, -1]);
    expect(along([0, 0, 1])).toEqual([-1, 0, 0]);
  });
});
