import type { ColourCorrection } from '@web360/core';
import { describe, expect, it } from 'vitest';

import { blendColour } from './colour';

const correction = (gain: number, haze = 0): ColourCorrection => ({
  gains: [[gain, gain, gain] as const, [1 / gain, 1, 1] as const],
  seam: { width: 0.8, offsets: [[haze, haze / 2, 0] as const] },
});

describe('blending colour corrections', () => {
  it('takes the first estimate as it is', () => {
    const first = correction(2);
    expect(blendColour(undefined, first, 0.3)).toBe(first);
  });

  it('meets halfway geometrically', () => {
    const blended = blendColour(correction(1), correction(4), 0.5);
    expect(blended.gains[0]?.[0]).toBeCloseTo(2, 9);
    expect(blended.gains[1]?.[0]).toBeCloseTo(0.5, 9);
  });

  it('moves the seam field linearly, as its offsets add', () => {
    const blended = blendColour(correction(1, 0), correction(1, 0.4), 0.25);
    expect(blended.seam.offsets[0]?.[0]).toBeCloseTo(0.1, 9);
    expect(blended.seam.width).toBe(0.8);
  });

  it('takes a new lens gain or seam direction as it is when the previous had none for it', () => {
    const previous = { gains: [], seam: { width: 0.8, offsets: [] } };
    expect(blendColour(previous, correction(3, 0.2), 0.5).seam.offsets[0]?.[0]).toBeCloseTo(0.2, 9);
    expect(blendColour(previous, correction(3), 0.5).gains[0]?.[0]).toBeCloseTo(3, 9);
  });
});
