import type { Vector3 } from '../shared/math/quaternion';

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;

/**
 * The unit direction an equirectangular pixel looks along, from normalized coordinates in `[0, 1]`.
 *
 * @remarks `u` runs left to right as longitude from `+pi` to `-pi`; `v` runs top to bottom as
 * latitude from `+pi/2` (up) to `-pi/2` (down). The centre looks along `+x`, up is `+z`, and
 * panning right turns the view right (image-right is world-right, not mirrored). This is the output
 * frame the stitch fills; its alignment to the camera is set by the stabilization rotation applied
 * before sampling and by the lens poses, and is confirmed on the stitch itself.
 */
export function toDirection(u: number, v: number): Vector3 {
  const longitude = Math.PI - u * TAU;
  const latitude = HALF_PI - v * Math.PI;
  const cosLatitude = Math.cos(latitude);
  return [cosLatitude * Math.cos(longitude), cosLatitude * Math.sin(longitude), Math.sin(latitude)];
}

/** The normalized equirectangular coordinates a unit direction maps to (the inverse of {@link toDirection}). */
export function toCoordinates(direction: Vector3): readonly [number, number] {
  const longitude = Math.atan2(direction[1], direction[0]);
  const latitude = Math.asin(Math.max(-1, Math.min(1, direction[2])));
  return [(Math.PI - longitude) / TAU, (HALF_PI - latitude) / Math.PI];
}
