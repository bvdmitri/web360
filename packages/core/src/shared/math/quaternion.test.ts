import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  conjugate,
  fromRotationVector,
  identity,
  multiply,
  normalize,
  rotate,
  slerp,
  type Quaternion,
  type Vector3,
} from './quaternion';

const component = fc.double({ min: -5, max: 5, noNaN: true });
const quaternion = fc.record({ w: component, x: component, y: component, z: component });
const unit = quaternion
  .filter((q) => Math.hypot(q.w, q.x, q.y, q.z) > 1e-3)
  .map((q) => normalize(q));
const vector = fc.tuple(component, component, component);

const magnitude = (q: Quaternion): number => Math.hypot(q.w, q.x, q.y, q.z);
const length3 = (v: Vector3): number => Math.hypot(v[0], v[1], v[2]);
const expectQuatClose = (a: Quaternion, b: Quaternion): void => {
  expect(a.w).toBeCloseTo(b.w, 9);
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};
const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
  expect(a[2]).toBeCloseTo(b[2], 9);
};

describe('quaternion', () => {
  it('normalizes any non-zero quaternion to unit length', () => {
    fc.assert(
      fc.property(
        quaternion.filter((q) => magnitude(q) > 1e-6),
        (q) => {
          expect(magnitude(normalize(q))).toBeCloseTo(1, 9);
        },
      ),
    );
  });

  it('normalizes the zero quaternion to the identity', () => {
    expect(normalize({ w: 0, x: 0, y: 0, z: 0 })).toEqual(identity());
  });

  it('leaves a rotation unchanged when multiplied by the identity', () => {
    fc.assert(
      fc.property(unit, (q) => {
        expectQuatClose(multiply(q, identity()), q);
        expectQuatClose(multiply(identity(), q), q);
      }),
    );
  });

  it('cancels a unit rotation against its conjugate', () => {
    fc.assert(
      fc.property(unit, (q) => {
        expectQuatClose(multiply(q, conjugate(q)), identity());
      }),
    );
  });

  it('preserves vector length under rotation', () => {
    fc.assert(
      fc.property(unit, vector, (q, v) => {
        expect(length3(rotate(q, v))).toBeCloseTo(length3(v), 9);
      }),
    );
  });

  it('leaves a vector unchanged under the identity rotation', () => {
    fc.assert(
      fc.property(vector, (v) => {
        expectVecClose(rotate(identity(), v), v);
      }),
    );
  });

  it('rotates by a product the same as rotating by each in turn', () => {
    fc.assert(
      fc.property(unit, unit, vector, (a, b, v) => {
        expectVecClose(rotate(multiply(a, b), v), rotate(a, rotate(b, v)));
      }),
    );
  });

  it('builds a unit rotation from any rotation vector', () => {
    fc.assert(
      fc.property(vector, (v) => {
        expect(magnitude(fromRotationVector(v))).toBeCloseTo(1, 9);
      }),
    );
  });

  it('maps a zero rotation vector to the identity', () => {
    expect(fromRotationVector([0, 0, 0])).toEqual(identity());
  });

  it('rotates about an axis by the rotation vector length', () => {
    const quarterTurnAboutZ = fromRotationVector([0, 0, Math.PI / 2]);
    expectVecClose(rotate(quarterTurnAboutZ, [1, 0, 0]), [0, 1, 0]);
  });
});

describe('slerp', () => {
  const forward: Vector3 = [1, 0, 0];

  it('returns the endpoints at t of 0 and 1', () => {
    fc.assert(
      fc.property(unit, unit, (a, b) => {
        expectQuatClose(slerp(a, b, 0), a);
        expectVecClose(rotate(slerp(a, b, 1), forward), rotate(b, forward));
      }),
    );
  });

  it('stays on the unit sphere throughout', () => {
    fc.assert(
      fc.property(unit, unit, fc.double({ min: 0, max: 1, noNaN: true }), (a, b, t) => {
        expect(magnitude(slerp(a, b, t))).toBeCloseTo(1, 9);
      }),
    );
  });

  it('interpolates a turn at a constant angular rate', () => {
    const halfway = slerp(identity(), fromRotationVector([0, 0, Math.PI / 2]), 0.5);
    const eighth = Math.PI / 4;
    expectVecClose(rotate(halfway, forward), [Math.cos(eighth), Math.sin(eighth), 0]);
  });

  it('falls back to a linear blend for nearly parallel rotations', () => {
    const tiny = fromRotationVector([0, 0, 1e-5]);
    const blended = slerp(identity(), tiny, 0.5);
    const halfTiny = fromRotationVector([0, 0, 5e-6]);
    expect(magnitude(blended)).toBeCloseTo(1, 9);
    expectVecClose(rotate(blended, forward), rotate(halfTiny, forward));
  });

  it('takes the shorter arc when a rotation exceeds half a turn', () => {
    const past = fromRotationVector([0, 0, 3.5]);
    const shortest = slerp(identity(), past, 1);
    expectVecClose(rotate(shortest, forward), rotate(past, forward));
  });
});
