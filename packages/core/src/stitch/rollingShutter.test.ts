import { describe, expect, it } from 'vitest';

import type { OrientationSample } from '../motion/orientation';
import { fromRotationVector, identity, rotate } from '../shared/math/quaternion';
import { microseconds, seconds } from '../shared/units/units';
import { rollingShutter } from './rollingShutter';

const RATE = 2; // rad/s about the IMU's z
const attitude: OrientationSample[] = [];
for (let index = 0; index <= 2000; index += 1) {
  attitude.push({
    timestamp: microseconds(index * 1000),
    orientation: fromRotationVector([0, 0, RATE * index * 0.001]),
  });
}
const shutter = rollingShutter({
  attitude,
  imuToCamera: identity(),
  frameTime: 500_000,
  readout: seconds(0.02),
  rows: 3000,
});

describe('rolling shutter from motion', () => {
  it('leaves the first row at the frame moment', () => {
    const [x, y, z] = rotate(shutter(0, [100, 0]), [1, 0, 0]);
    expect([x, y, z].map((value) => Number(value.toFixed(9)))).toEqual([1, 0, 0]);
  });

  it('turns later rows back by how far the camera turned before they were read', () => {
    const lastRow = shutter(1, [100, 3000]);
    const turned = rotate(lastRow, [1, 0, 0]);
    const angle = Math.atan2(turned[1], turned[0]);
    expect(angle).toBeCloseTo(-RATE * 0.02, 6);
  });

  it('maps the turn through the IMU-to-camera rotation', () => {
    const mounted = rollingShutter({
      attitude,
      imuToCamera: fromRotationVector([Math.PI / 2, 0, 0]),
      frameTime: 500_000,
      readout: seconds(0.02),
      rows: 3000,
    });
    const turned = rotate(mounted(0, [0, 1500]), [1, 0, 0]);
    expect(Math.atan2(-turned[2], turned[0])).toBeCloseTo(RATE * 0.01, 6);
  });
});
