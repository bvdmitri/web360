import { describe, expect, it } from 'vitest';

import { rotate, type Quaternion, type Vector3 } from '../shared/math/quaternion';
import { axisAlignments } from './axes';

const X: Vector3 = [1, 0, 0];
const Y: Vector3 = [0, 1, 0];

const signature = (q: Quaternion): string =>
  [...rotate(q, X), ...rotate(q, Y)].map((value) => Math.round(value)).join(',');

describe('axis alignments', () => {
  it('lists the 24 distinct rotations that map axes onto axes', () => {
    const alignments = axisAlignments();
    expect(alignments).toHaveLength(24);
    expect(new Set(alignments.map((q) => signature(q))).size).toBe(24);
  });

  it('sends every axis exactly onto a signed axis', () => {
    for (const q of axisAlignments()) {
      for (const axis of [X, Y, [0, 0, 1] as Vector3]) {
        const image = rotate(q, axis);
        const rounded = image.map((value) => Math.round(value));
        expect(rounded.filter((value) => value !== 0)).toHaveLength(1);
        for (const [index, value] of image.entries())
          expect(value).toBeCloseTo(rounded[index] ?? 0, 9);
      }
    }
  });

  it('starts with the identity', () => {
    expect(signature(axisAlignments()[0]!)).toBe('1,0,0,0,1,0');
  });
});
