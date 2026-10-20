import { describe, expect, it } from 'vitest';

import { goproCubeMap } from '../format/gopro/cube';
import { fromRotationVector } from '../shared/math/quaternion';
import { CUBE_LAYOUT, packCube, type CubeFrame } from './packCube';

const frame: CubeFrame = {
  cube: goproCubeMap({ width: 5888, height: 1920 }),
  correction: fromRotationVector([0.1, -0.2, 0.3]),
  width: 2048,
  height: 1024,
};

const slot = (packed: Float32Array, index: number): number[] => [
  ...packed.subarray(index * 4, index * 4 + 4),
];

const faceSlot = (packed: Float32Array, face: number, offset: number): number[] =>
  slot(packed, CUBE_LAYOUT.header + face * CUBE_LAYOUT.faceSlots + offset);

describe('packing a cube-map frame for a renderer', () => {
  it('holds the correction and the output size and face count in its header', () => {
    const packed = packCube(frame);
    const q = frame.correction;
    expect(slot(packed, 0)).toEqual([q.x, q.y, q.z, q.w].map((value) => Math.fround(value)));
    expect(slot(packed, 1)).toEqual([2048, 1024, 6, 0]);
    expect(packed).toHaveLength((CUBE_LAYOUT.header + 6 * CUBE_LAYOUT.faceSlots) * 4);
  });

  it('lays out each face as its frame, texture, size, band and origin', () => {
    const packed = packCube(frame);
    for (const [index, face] of frame.cube.faces.entries()) {
      expect(faceSlot(packed, index, 0)).toEqual([...face.centre, face.texture]);
      expect(faceSlot(packed, index, 1)).toEqual([...face.across, face.size]);
      expect(faceSlot(packed, index, 2)).toEqual([...face.down, face.band]);
      expect(faceSlot(packed, index, 3)).toEqual([...face.origin, 0, 0]);
    }
  });
});
