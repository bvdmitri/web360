import type { Vector3 } from '../shared/math/quaternion';

/**
 * One face of an equi-angular cube map as a camera stores it: where it sits in which texture, its
 * size, the seam band it carries, and the cube frame it looks along.
 *
 * @remarks `origin` is the face's top-left corner in texture pixels and `size` its side in logical
 * pixels. A face coordinate `(u, v)` in `[-1, 1]` (columns across, rows down) looks along
 * `centre + tan(u * pi/4) * across + tan(v * pi/4) * down`. When a camera stitches its lenses
 * itself, a face its seam crosses stores the `band` logical columns around its middle twice, one
 * copy after the other, so it is `size + band` texture pixels wide; `band` is 0 for a face without.
 */
export interface CubeFace {
  readonly texture: number;
  readonly origin: readonly [number, number];
  readonly size: number;
  readonly band: number;
  readonly centre: Vector3;
  readonly across: Vector3;
  readonly down: Vector3;
}

/** A sphere stored as the six faces of an equi-angular cube map. */
export interface CubeMap {
  readonly faces: readonly CubeFace[];
}
