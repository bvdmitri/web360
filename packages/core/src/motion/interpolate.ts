import { identity, slerp, type Quaternion } from '../shared/math/quaternion';
import type { Microseconds } from '../shared/units/units';

/**
 * The rotation a timestamped stream holds at `time`, interpolated between its samples.
 *
 * @remarks `samples` must be in time order; `rotationOf` picks the rotation out of each (an
 * attitude, a correction). Between two samples the result is their {@link slerp} at the time's
 * fraction of the interval, so it turns at a constant rate; before the first sample or after the
 * last it holds that sample; an empty stream is the identity. The bracketing samples are found by
 * binary search, so sampling a long gyro-rate stream at every video frame stays cheap.
 */
export function rotationAt<T extends { readonly timestamp: Microseconds }>(
  samples: readonly T[],
  time: number,
  rotationOf: (sample: T) => Quaternion,
): Quaternion {
  const index = firstAtOrAfter(samples, time);
  const later = samples[index];
  const earlier = samples[index - 1];
  if (later === undefined) return earlier === undefined ? identity() : rotationOf(earlier);
  if (earlier === undefined) return rotationOf(later);
  const fraction = (time - earlier.timestamp) / (later.timestamp - earlier.timestamp);
  return slerp(rotationOf(earlier), rotationOf(later), fraction);
}

function firstAtOrAfter(
  samples: readonly { readonly timestamp: Microseconds }[],
  time: number,
): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((samples[middle]?.timestamp ?? time) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}
