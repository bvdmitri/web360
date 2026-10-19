import type { ColourCorrection, Rgb } from '@web360/core';

/**
 * Moves a running colour correction toward a new estimate by `weight` (0 keeps the old, 1 takes the
 * new), so exposure follows the scene without flickering frame to frame.
 *
 * @remarks Gains blend geometrically (in log space), as they scale brightness; the vignetting
 * strength and start blend linearly. Without a previous correction the estimate is taken as it is.
 */
export function blendColour(
  previous: ColourCorrection | undefined,
  next: ColourCorrection,
  weight: number,
): ColourCorrection {
  if (previous === undefined) return next;
  const mix = (a: number, b: number): number => a + (b - a) * weight;
  const gains = next.gains.map((gain, lens): Rgb => {
    const old = previous.gains[lens] ?? gain;
    return [
      Math.exp(mix(Math.log(old[0]), Math.log(gain[0]))),
      Math.exp(mix(Math.log(old[1]), Math.log(gain[1]))),
      Math.exp(mix(Math.log(old[2]), Math.log(gain[2]))),
    ];
  });
  return {
    gains,
    vignetting: {
      strength: mix(previous.vignetting.strength, next.vignetting.strength),
      start: mix(previous.vignetting.start, next.vignetting.start),
    },
  };
}
