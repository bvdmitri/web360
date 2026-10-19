import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  fromRotationVector,
  identity,
  normalize,
  rotate,
  type Vector3,
} from '../shared/math/quaternion';
import { outputToCamera } from './view';

const component = fc.double({ min: -1, max: 1, noNaN: true });
const rotation = fc
  .record({ w: component, x: component, y: component, z: component })
  .filter((q) => Math.hypot(q.w, q.x, q.y, q.z) > 0.1)
  .map((q) => normalize(q));
const direction = fc.tuple(component, component, component).filter((v) => Math.hypot(...v) > 0.1);

describe('output to camera', () => {
  it('is the IMU-to-camera rotation when the view follows the camera', () => {
    const mount = fromRotationVector([0, Math.PI / 2, 0]);
    const attitude = fromRotationVector([0.3, -0.2, 0.9]);
    const composed = outputToCamera(mount, attitude, attitude);
    expect(rotate(composed, [1, 0, 0])[2]).toBeCloseTo(rotate(mount, [1, 0, 0])[2], 9);
  });

  it('takes an output direction through the world and the body into the camera frame', () => {
    fc.assert(
      fc.property(
        fc.tuple(rotation, rotation, rotation),
        direction,
        ([mount, attitude, view], output) => {
          const world = rotate(view, output);
          const body = rotate(
            { ...attitude, x: -attitude.x, y: -attitude.y, z: -attitude.z },
            world,
          );
          const expected: Vector3 = rotate(mount, body);
          const actual = rotate(outputToCamera(mount, attitude, view), output);
          for (const [index, value] of actual.entries())
            expect(value).toBeCloseTo(expected[index] ?? 0, 9);
        },
      ),
    );
  });

  it('is the identity when every frame agrees', () => {
    expect(outputToCamera(identity(), identity(), identity())).toEqual(identity());
  });
});
