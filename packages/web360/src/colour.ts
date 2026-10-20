import type { ColourCorrection, Rgb } from '@web360/core';

/**
 * Moves a running colour correction toward a new estimate by `weight` (0 keeps the old, 1 takes the
 * new), so exposure follows the scene without flickering frame to frame.
 *
 * @remarks Gains blend geometrically (in log space), as they scale brightness. Without a previous
 * correction the estimate is taken as it is.
 */
export function blendColour(
  previous: ColourCorrection | undefined,
  next: ColourCorrection,
  weight: number,
): ColourCorrection {
  if (previous === undefined) return next;
  const mix = (a: number, b: number): number =>
    Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * weight);
  return {
    gains: next.gains.map((gain, lens): Rgb => {
      const old = previous.gains[lens] ?? gain;
      return [mix(old[0], gain[0]), mix(old[1], gain[1]), mix(old[2], gain[2])];
    }),
  };
}
