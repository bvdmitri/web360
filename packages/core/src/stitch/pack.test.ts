import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { project, unproject } from '../optics/lens';
import {
  fromRotationVector,
  identity,
  rotate,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { packStitch, STITCH_LAYOUT, type StitchFrame, type StitchLens } from './pack';

const optics = (pitch: number, roll: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1400,
  fieldOfView: degrees(183),
  coverage: degrees(188),
  center: [1500, 1480],
  orientation: { yaw: degrees(3), pitch: degrees(pitch), roll: degrees(roll) },
});

const lens = (pitch: number, roll: number): StitchLens => ({
  optics: optics(pitch, roll),
  image: { texture: 1, origin: [3000, 0], extent: [3000, 3000] },
});

const frame = (overrides: Partial<StitchFrame> = {}): StitchFrame => ({
  lenses: [lens(0, 0), lens(180, 2)],
  correction: fromRotationVector([0.1, -0.2, 0.3]),
  width: 1920,
  height: 960,
  ...overrides,
});

const slot = (packed: Float32Array, index: number): number[] => [
  ...packed.subarray(index * 4, index * 4 + 4),
];
const lensSlot = (packed: Float32Array, lensIndex: number, offset: number): number[] =>
  slot(packed, STITCH_LAYOUT.header + lensIndex * STITCH_LAYOUT.lensSlots + offset);
const quaternionOf = ([x, y, z, w]: number[]): Quaternion => ({
  w: w ?? 0,
  x: x ?? 0,
  y: y ?? 0,
  z: z ?? 0,
});

// The shader's projection, written over the packed numbers, so the test pins what it relies on.
function projectPacked(
  packed: Float32Array,
  index: number,
  direction: Vector3,
): readonly [number, number] {
  const inverse = quaternionOf(lensSlot(packed, index, 0));
  const [cx, cy, focal] = lensSlot(packed, index, 1);
  const [x, y, z] = rotate(inverse, direction);
  const angle = Math.atan2(Math.hypot(x, y), z);
  const azimuth = Math.atan2(y, x);
  const r = (focal ?? 0) * angle;
  return [(cx ?? 0) + r * Math.cos(azimuth), (cy ?? 0) + r * Math.sin(azimuth)];
}

const shutter = (lensIndex: number, pixel: readonly [number, number]): Quaternion =>
  fromRotationVector([0, (lensIndex + 1) * pixel[1] * 1e-5, 0]);

describe('stitch packing', () => {
  it('starts with the correction and the frame shape', () => {
    const packed = packStitch(frame());
    const correction = frame().correction;
    expect(slot(packed, 0)).toEqual(
      [correction.x, correction.y, correction.z, correction.w].map((value) => Math.fround(value)),
    );
    expect(slot(packed, 1)).toEqual([1920, 960, 2, 0]);
    expect(packed).toHaveLength((STITCH_LAYOUT.header + 2 * STITCH_LAYOUT.lensSlots) * 4);
  });

  it('carries what reproduces each lens projection', () => {
    const packed = packStitch(frame());
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }),
        fc.double({ min: 0, max: 1300, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (index, radius, azimuth) => {
          const { optics: lensOptics } = frame().lenses[index]!;
          const pixel: [number, number] = [
            lensOptics.center[0] + radius * Math.cos(azimuth),
            lensOptics.center[1] + radius * Math.sin(azimuth),
          ];
          const reproduced = projectPacked(packed, index, unproject(lensOptics, pixel));
          expect(reproduced[0]).toBeCloseTo(pixel[0], 1);
          expect(reproduced[1]).toBeCloseTo(pixel[1], 1);
        },
      ),
    );
  });

  it('states each lens field of view, coverage and image placement', () => {
    const packed = packStitch(frame());
    const [halfField, halfCoverage, texture, rows] = lensSlot(packed, 1, 2);
    expect(halfField).toBeCloseTo((183 * Math.PI) / 360, 6);
    expect(halfCoverage).toBeCloseTo((188 * Math.PI) / 360, 6);
    expect([texture, rows]).toEqual([1, 0]);
    expect(lensSlot(packed, 1, 3)).toEqual([3000, 0, 3000, 3000]);
  });

  it('leaves the colour alone without gains or vignetting', () => {
    const packed = packStitch(frame());
    expect(lensSlot(packed, 0, 4)).toEqual([1, 1, 1, 0]);
    expect(lensSlot(packed, 0, 5)).toEqual([0, 0, 0, 0]);
  });

  it('carries each lens gain and its own vignetting', () => {
    const second = lens(180, 2);
    const packed = packStitch(
      frame({
        lenses: [
          lens(0, 0),
          { ...second, optics: { ...second.optics, vignetting: { strength: 0.5, start: 0.5 } } },
        ],
        gains: [
          [1.25, 1.5, 0.75],
          [0.5, 1, 2],
        ],
      }),
    );
    expect(lensSlot(packed, 0, 5)).toEqual([0, 0, 0, 0]);
    expect(lensSlot(packed, 1, 4)).toEqual([0.5, 1, 2, 0.5]);
    expect(lensSlot(packed, 1, 5)).toEqual([0.25, 0, 0, 0]);
  });

  it('tabulates the rolling-shutter turn down each lens image', () => {
    const packed = packStitch(frame({ shutter: { sample: shutter, rows: 3000, steps: 3 } }));
    expect(slot(packed, 1)[3]).toBe(3);
    expect(lensSlot(packed, 0, 2)[3]).toBe(3000);
    const table = STITCH_LAYOUT.header + 2 * STITCH_LAYOUT.lensSlots;
    const lastOfSecond = quaternionOf(slot(packed, table + 5));
    const expected = shutter(1, [0, 3000]);
    expect(lastOfSecond.y).toBeCloseTo(expected.y, 6);
    expect(lastOfSecond.w).toBeCloseTo(expected.w, 6);
    expect(quaternionOf(slot(packed, table + 1)).y).toBeCloseTo(shutter(0, [0, 1500]).y, 6);
  });

  it('packs a quaternion as x, y, z, then w', () => {
    const packed = packStitch(frame({ correction: identity() }));
    expect(slot(packed, 0)).toEqual([0, 0, 0, 1]);
  });

  it('agrees with the optics on where a direction lands', () => {
    const packed = packStitch(frame());
    const direction: Vector3 = [0.3, -0.4, Math.sqrt(1 - 0.25)];
    const expected = project(frame().lenses[0]!.optics, direction).pixel;
    const reproduced = projectPacked(packed, 0, direction);
    expect(reproduced[0]).toBeCloseTo(expected[0], 1);
    expect(reproduced[1]).toBeCloseTo(expected[1], 1);
  });
});
