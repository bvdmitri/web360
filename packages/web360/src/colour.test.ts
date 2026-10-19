import type { ColourCorrection } from '@web360/core';
import { describe, expect, it } from 'vitest';

import { blendColour } from './colour';

const correction = (gain: number, strength: number): ColourCorrection => ({
  gains: [[gain, gain, gain] as const, [1 / gain, 1, 1] as const],
  vignetting: { strength, start: 0.8 },
});

describe('blending colour corrections', () => {
  it('takes the first estimate as it is', () => {
    const first = correction(2, 0.4);
    expect(blendColour(undefined, first, 0.3)).toBe(first);
  });

  it('meets halfway geometrically for gains and linearly for vignetting', () => {
    const blended = blendColour(correction(1, 0), correction(4, 0.4), 0.5);
    expect(blended.gains[0]?.[0]).toBeCloseTo(2, 9);
    expect(blended.gains[1]?.[0]).toBeCloseTo(0.5, 9);
    expect(blended.vignetting.strength).toBeCloseTo(0.2, 9);
  });

  it('takes a new lens gain as it is when the previous had none for it', () => {
    const previous = { gains: [], vignetting: { strength: 0, start: 1 } };
    expect(blendColour(previous, correction(3, 0), 0.5).gains[0]?.[0]).toBeCloseTo(3, 9);
  });
});
