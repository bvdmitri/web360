import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Vector3 } from '../shared/math/quaternion';
import { toCoordinates, toDirection } from './equirectangular';

const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
  expect(a[2]).toBeCloseTo(b[2], 9);
};

describe('equirectangular projection', () => {
  it('looks forward at the centre', () => {
    expectVecClose(toDirection(0.5, 0.5), [1, 0, 0]);
  });

  it('looks up at the top and down at the bottom', () => {
    expectVecClose(toDirection(0.5, 0), [0, 0, 1]);
    expectVecClose(toDirection(0.5, 1), [0, 0, -1]);
  });

  it('looks backward at both horizontal edges', () => {
    expectVecClose(toDirection(0, 0.5), [-1, 0, 0]);
    expectVecClose(toDirection(1, 0.5), [-1, 0, 0]);
  });

  it('produces unit directions', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (u, v) => {
          const d = toDirection(u, v);
          expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1, 9);
        },
      ),
    );
  });

  it('round-trips coordinates away from the poles and the seam', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (u, v) => {
          const [back0, back1] = toCoordinates(toDirection(u, v));
          expect(back0).toBeCloseTo(u, 9);
          expect(back1).toBeCloseTo(v, 9);
        },
      ),
    );
  });
});
