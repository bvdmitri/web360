import type { ColourCorrection, Rgb } from '@web360/core';

/**
 * Moves a running colour correction toward a new estimate by `weight` (0 keeps the old, 1 takes the
 * new), so exposure follows the scene without flickering frame to frame.
 *
 * @remarks Gains blend geometrically (in log space), as they scale brightness; the seam field's
 * offsets, which add, blend linearly. Without a previous correction the estimate is taken as it is.
 */
export function blendColour(
  previous: ColourCorrection | undefined,
  next: ColourCorrection,
  weight: number,
): ColourCorrection {
  if (previous === undefined) return next;
  const mix = (a: number, b: number): number =>
    Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * weight);
  const add = (a: number, b: number): number => a + (b - a) * weight;
  return {
    gains: next.gains.map((gain, lens): Rgb => {
      const old = previous.gains[lens] ?? gain;
      return [mix(old[0], gain[0]), mix(old[1], gain[1]), mix(old[2], gain[2])];
    }),
    seam: {
      width: next.seam.width,
      offsets: next.seam.offsets.map((offset, bin): Rgb => {
        const old = previous.seam.offsets[bin] ?? offset;
        return [add(old[0], offset[0]), add(old[1], offset[1]), add(old[2], offset[2])];
      }),
    },
  };
}
