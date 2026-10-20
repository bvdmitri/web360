import type { CubeFace, CubeMap } from '../model/cube';
import type { Vector3 } from '../shared/math/quaternion';

// Face coordinates span a quarter turn, plus and minus pi/4.
const QUARTER_TURN = 4;
const QUARTER_PI = Math.PI / QUARTER_TURN;

/** Where to read a cube map for a direction, and how much of the colour comes from there. */
export interface CubeSample {
  readonly texture: number;
  readonly pixel: readonly [number, number];
  readonly weight: number;
}

/**
 * Finds where a direction is stored in an equi-angular cube map.
 *
 * @remarks The face is the one whose centre the direction leans toward most. Its face coordinates
 * are the angles to the face centre along `across` and `down`, over a quarter turn, so pixels are
 * evenly spaced in angle. `pixel` is in texture pixels with a texel's centre at `+0.5`. Inside a
 * seamed face's band the direction is stored twice; both copies come back, cross-faded linearly
 * across the band (the first copy fully at its start, the second at its end), so the camera's own
 * seam step is smoothed out. Elsewhere one sample comes back with weight 1.
 */
export function cubeSamples(cube: CubeMap, direction: Vector3): CubeSample[] {
  const face = facing(cube, direction);
  if (face === undefined) return [];
  const along = dot(direction, face.centre);
  const u = Math.atan(dot(direction, face.across) / along) / QUARTER_PI;
  const v = Math.atan(dot(direction, face.down) / along) / QUARTER_PI;
  const column = ((u + 1) / 2) * face.size;
  const row = face.origin[1] + ((v + 1) / 2) * face.size;
  const start = (face.size - face.band) / 2;
  const at = (offset: number, weight: number): CubeSample => ({
    texture: face.texture,
    pixel: [face.origin[0] + column + offset, row],
    weight,
  });
  if (face.band === 0 || column < start) return [at(0, 1)];
  if (column >= start + face.band) return [at(face.band, 1)];
  const share = (column - start) / face.band;
  return [at(0, 1 - share), at(face.band, share)];
}

/** The unit direction a cube-map sample was read for (the inverse of {@link cubeSamples}). */
export function cubeDirection(cube: CubeMap, sample: CubeSample): Vector3 {
  const face = cube.faces.find((one) => isStoredIn(one, sample));
  if (face === undefined) return [0, 0, 0];
  const stored = sample.pixel[0] - face.origin[0];
  const column = stored < (face.size + face.band) / 2 ? stored : stored - face.band;
  const u = (column / face.size) * 2 - 1;
  const v = ((sample.pixel[1] - face.origin[1]) / face.size) * 2 - 1;
  const across = Math.tan(u * QUARTER_PI);
  const down = Math.tan(v * QUARTER_PI);
  const direction: Vector3 = [0, 1, 2].map(
    (axis) =>
      (face.centre[axis] ?? 0) + across * (face.across[axis] ?? 0) + down * (face.down[axis] ?? 0),
  ) as unknown as Vector3;
  const length = Math.hypot(...direction);
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function facing(cube: CubeMap, direction: Vector3): CubeFace | undefined {
  let best: CubeFace | undefined;
  let most = -Infinity;
  for (const face of cube.faces) {
    const along = dot(direction, face.centre);
    if (along <= most) continue;
    best = face;
    most = along;
  }
  return best;
}

function isStoredIn(face: CubeFace, sample: CubeSample): boolean {
  const x = sample.pixel[0] - face.origin[0];
  const y = sample.pixel[1] - face.origin[1];
  return (
    sample.texture === face.texture &&
    x >= 0 &&
    x <= face.size + face.band &&
    y >= 0 &&
    y <= face.size
  );
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
