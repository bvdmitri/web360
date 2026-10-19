import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import type { Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { toDirection } from './equirectangular';
import { stitchSample } from './sample';

const lens = (fovDegrees: number, pitch: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(fovDegrees),
  coverage: degrees(fovDegrees),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(pitch), roll: degrees(0) },
});

// A dual-fisheye pair: the front lens looks along +z, the back lens along -z (pitched 180 degrees).
const front = lens(193, 0);
const back = lens(193, 180);

const totalWeight = (samples: readonly { weight: number }[]): number =>
  samples.reduce((sum, one) => sum + one.weight, 0);

describe('stitch sampling', () => {
  it('takes a direction down one lens from only that lens', () => {
    const up = stitchSample([front, back], [0, 0, 1]);
    expect(up).toHaveLength(1);
    expect(up[0]?.lens).toBe(0);
    expect(up[0]?.weight).toBeCloseTo(1, 9);

    const down = stitchSample([front, back], [0, 0, -1]);
    expect(down).toHaveLength(1);
    expect(down[0]?.lens).toBe(1);
  });

  it('blends the two lenses evenly on the equatorial seam', () => {
    const seam = stitchSample([front, back], [1, 0, 0]);
    expect(seam).toHaveLength(2);
    expect(seam[0]?.weight).toBeCloseTo(0.5, 6);
    expect(seam[1]?.weight).toBeCloseTo(0.5, 6);
  });

  it('returns no sample for a direction no lens covers', () => {
    const narrow = lens(60, 0);
    expect(stitchSample([narrow], [1, 0, 0])).toEqual([]);
  });

  it('weights a lone lens fully even at the exact field-of-view edge', () => {
    const hemisphere = lens(180, 0);
    const edge = stitchSample([hemisphere], [1, 0, 0]);
    expect(edge).toHaveLength(1);
    expect(edge[0]?.weight).toBe(1);
  });

  it('covers the whole sphere with weights summing to one', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (u, v) => {
          const direction: Vector3 = toDirection(u, v);
          expect(totalWeight(stitchSample([front, back], direction))).toBeCloseTo(1, 9);
        },
      ),
    );
  });
});
