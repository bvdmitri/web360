import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { toCoordinates } from '../stitch/equirectangular';
import type { Rgb } from '../stitch/sampler';
import type { Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { packView, renderView, viewDirection } from './project';
import type { View } from './view';

const view = (parts: Partial<Record<keyof View, number>> = {}): View => ({
  pan: degrees(parts.pan ?? 0),
  tilt: degrees(parts.tilt ?? 0),
  roll: degrees(parts.roll ?? 0),
  fov: degrees(parts.fov ?? 90),
  distance: parts.distance ?? 0,
});

const expectVecClose = (a: Vector3, b: Vector3, digits = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
  expect(a[2]).toBeCloseTo(b[2], digits);
};

const angleFromForward = (direction: Vector3): number =>
  (Math.acos(Math.max(-1, Math.min(1, direction[0]))) * 180) / Math.PI;

const CENTRE = [0.5, 0.5] as const;
const WIDE = 16 / 9;
const TALL = 9 / 16;

describe('the direction a view pixel looks along', () => {
  it('looks where the view looks at the centre of the picture, at any distance', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (distance) => {
        expectVecClose(viewDirection(view({ distance }), CENTRE, WIDE), [1, 0, 0]);
        expectVecClose(viewDirection(view({ pan: 90, distance }), CENTRE, WIDE), [0, -1, 0]);
      }),
    );
  });

  it('spans the field of view across the longer side of a flat lens', () => {
    const fov = 100;
    const right = viewDirection(view({ fov }), [1, 0.5], WIDE);
    expect(angleFromForward(right)).toBeCloseTo(fov / 2, 9);
    expect(right[1]).toBeLessThan(0);
    const top = viewDirection(view({ fov }), [0.5, 0], TALL);
    expect(angleFromForward(top)).toBeCloseTo(fov / 2, 9);
    expect(top[2]).toBeGreaterThan(0);
  });

  it('keeps straight lines straight at distance 0: the image plane maps to a plane', () => {
    const along = [0, 0.25, 0.5, 0.75, 1].map((u) => viewDirection(view(), [u, 0.2], WIDE));
    for (const direction of along) {
      const scale = 1 / direction[0];
      expect(direction[2] * scale).toBeCloseTo((along[0]?.[2] ?? 0) / (along[0]?.[0] ?? 1), 9);
    }
  });

  it('doubles the angle at distance 1, a stereographic lens', () => {
    const fov = 150;
    const edge = viewDirection(view({ fov, distance: 1 }), [1, 0.5], WIDE);
    expect(angleFromForward(edge)).toBeCloseTo(fov, 9);
  });

  it('shows the ground all round the middle of a tiny planet', () => {
    const tiny = view({ tilt: -90, fov: 150, distance: 1 });
    expectVecClose(viewDirection(tiny, CENTRE, 1), [0, 0, -1]);
    expect(viewDirection(tiny, [1, 0.5], 1)[2]).toBeGreaterThan(0);
  });

  it('gives unit directions everywhere', () => {
    const between = (min: number, max: number): fc.Arbitrary<number> =>
      fc.double({ min, max, noNaN: true });
    const pixelAndView = fc.record({
      u: between(0, 1),
      v: between(0, 1),
      fov: between(30, 160),
      distance: between(0, 1),
      pan: between(-180, 180),
    });
    fc.assert(
      fc.property(pixelAndView, ({ u, v, fov, distance, pan }) => {
        const direction = viewDirection(view({ fov, distance, pan }), [u, v], WIDE);
        expect(Math.hypot(...direction)).toBeCloseTo(1, 9);
      }),
    );
  });
});

describe('the packed view', () => {
  it('holds the rotation, the lens scale per axis, the distance and the size', () => {
    const packed = packView(view({ fov: 90, distance: 0.5 }), { width: 1920, height: 1080 });
    expect([...packed.slice(0, 4)]).toEqual([0, 0, 0, 1]);
    expect(packed[4]).toBeCloseTo(1, 6);
    expect(packed[5]).toBeCloseTo(9 / 16, 6);
    expect(packed[6]).toBeCloseTo(0.5, 6);
    expect([...packed.slice(8)]).toEqual([1920, 1080, 0, 0]);
  });

  it('scales the shorter side down on a tall picture', () => {
    const packed = packView(view({ fov: 90 }), { width: 1080, height: 1920 });
    expect(packed[4]).toBeCloseTo(9 / 16, 6);
    expect(packed[5]).toBeCloseTo(1, 6);
  });
});

describe('the reference view render', () => {
  it('reads the equirectangular frame where each pixel looks', () => {
    const source = { width: 64, height: 32 };
    const seen: (readonly [number, number])[] = [];
    const sampler = (pixel: readonly [number, number]): Rgb => {
      seen.push(pixel);
      return [pixel[0] / source.width, pixel[1] / source.height, 0];
    };
    const pixels = renderView({ view: view(), sampler, source, width: 4, height: 2 });
    expect(pixels).toHaveLength(8);
    const [u, v] = toCoordinates(viewDirection(view(), [0.125, 0.25], 2));
    expect(seen[0]?.[0]).toBeCloseTo(u * source.width, 9);
    expect(seen[0]?.[1]).toBeCloseTo(v * source.height, 9);
  });
});
