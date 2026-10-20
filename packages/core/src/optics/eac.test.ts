import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CubeFace, CubeMap } from '../model/cube';
import type { Vector3 } from '../shared/math/quaternion';
import { cubeDirection, cubeSamples } from './eac';

const F = 100;
const B = 8;

const face = (
  texture: number,
  origin: readonly [number, number],
  axes: { centre: Vector3; across: Vector3; down: Vector3; band: number },
): CubeFace => ({ texture, origin, size: F, ...axes });

// The MAX2 layout at a small size: left, front, right in texture 0; down, back, up in texture 1.
const cube: CubeMap = {
  faces: [
    face(0, [0, 0], { centre: [0, 1, 0], across: [1, 0, 0], down: [0, 0, -1], band: B }),
    face(0, [F + B, 0], { centre: [1, 0, 0], across: [0, -1, 0], down: [0, 0, -1], band: 0 }),
    face(0, [2 * F + B, 0], { centre: [0, -1, 0], across: [-1, 0, 0], down: [0, 0, -1], band: B }),
    face(1, [0, 0], { centre: [0, 0, -1], across: [-1, 0, 0], down: [0, 1, 0], band: B }),
    face(1, [F + B, 0], { centre: [-1, 0, 0], across: [0, 0, 1], down: [0, 1, 0], band: 0 }),
    face(1, [2 * F + B, 0], { centre: [0, 0, 1], across: [1, 0, 0], down: [0, 1, 0], band: B }),
  ],
};

const unit = (v: Vector3): Vector3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

const component = fc.double({ min: -1, max: 1, noNaN: true });

describe('equi-angular cube lookup', () => {
  it('finds the front face centre straight ahead', () => {
    const [only, ...rest] = cubeSamples(cube, [1, 0, 0]);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ texture: 0, weight: 1 });
    expect(only?.pixel[0]).toBeCloseTo(F + B + F / 2, 9);
    expect(only?.pixel[1]).toBeCloseTo(F / 2, 9);
  });

  it('spaces a face evenly in angle: halfway to the edge is a quarter of the way across', () => {
    // 22.5 degrees right of straight ahead: halfway to the face edge at 45 degrees.
    const angle = Math.PI / 8;
    const [sample] = cubeSamples(cube, [Math.cos(angle), -Math.sin(angle), 0]);
    expect(sample?.pixel[0]).toBeCloseTo(F + B + 0.75 * F, 9);
  });

  it('reads the up face for a direction straight up, both copies of its centre column evenly', () => {
    const samples = cubeSamples(cube, [0, 0, 1]);
    expect(samples.map((sample) => sample.texture)).toEqual([1, 1]);
    const columns = samples.map((sample) => sample.pixel[0] - (2 * F + B));
    expect(columns[0]).toBeCloseTo(F / 2, 9);
    expect(columns[1]).toBeCloseTo(F / 2 + B, 9);
    expect(samples.map((sample) => sample.weight)).toEqual([0.5, 0.5]);
  });

  it('skips the duplicated band to the right of a seamed face', () => {
    const [sample] = cubeSamples(cube, unit([1, 1, 0.3]));
    // Toward the front from the left face's centre: past its band, so shifted by it.
    expect(sample?.pixel[0]).toBeGreaterThan(F / 2 + B / 2 + B);
  });

  it('cross-fades the two stored copies across a seamed face band', () => {
    // A hair right of the left face's centre column: inside the band.
    const direction = unit([Math.tan(0.01), 1, 0]);
    const samples = cubeSamples(cube, direction);
    expect(samples).toHaveLength(2);
    const [first, second] = samples;
    expect(second!.pixel[0] - first!.pixel[0]).toBeCloseTo(B, 9);
    expect(first!.weight + second!.weight).toBeCloseTo(1, 12);
    expect(second!.weight).toBeGreaterThan(0.5);
  });

  it('returns to the direction it came from', () => {
    fc.assert(
      fc.property(fc.tuple(component, component, component), ([x, y, z]) => {
        fc.pre(Math.hypot(x, y, z) > 0.1);
        const direction = unit([x, y, z]);
        const samples = cubeSamples(cube, direction);
        for (const sample of samples) {
          const back = cubeDirection(cube, sample);
          expect(back[0]).toBeCloseTo(direction[0], 6);
          expect(back[1]).toBeCloseTo(direction[1], 6);
          expect(back[2]).toBeCloseTo(direction[2], 6);
        }
      }),
    );
  });

  it('finds nothing in a cube with no faces, and no direction for a sample no face stores', () => {
    expect(cubeSamples({ faces: [] }, [1, 0, 0])).toEqual([]);
    expect(cubeDirection(cube, { texture: 5, pixel: [1, 1], weight: 1 })).toEqual([0, 0, 0]);
  });
});
