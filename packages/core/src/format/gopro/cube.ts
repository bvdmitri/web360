import type { CubeFace, CubeMap } from '../../model/cube';
import type { Vector3 } from '../../shared/math/quaternion';

const FACES_PER_TRACK = 3;
const SEAMED_PER_TRACK = 2;

/** A GoPro video track whose size is not three cube faces side by side. */
export class UnsupportedLayoutError extends Error {
  public override readonly name = 'UnsupportedLayoutError';
}

// Each track's faces left to right, in the camera's cube frame (FORMAT-gopro.md).
const TRACKS: readonly (readonly {
  centre: Vector3;
  across: Vector3;
  down: Vector3;
  seamed: boolean;
}[])[] = [
  [
    { centre: [0, 1, 0], across: [1, 0, 0], down: [0, 0, -1], seamed: true },
    { centre: [1, 0, 0], across: [0, -1, 0], down: [0, 0, -1], seamed: false },
    { centre: [0, -1, 0], across: [-1, 0, 0], down: [0, 0, -1], seamed: true },
  ],
  [
    { centre: [0, 0, -1], across: [-1, 0, 0], down: [0, 1, 0], seamed: true },
    { centre: [-1, 0, 0], across: [0, 0, 1], down: [0, 1, 0], seamed: false },
    { centre: [0, 0, 1], across: [1, 0, 0], down: [0, 1, 0], seamed: true },
  ],
];

/**
 * The equi-angular cube map a GoPro MAX or MAX2 stores across its two video tracks, from their
 * size.
 *
 * @remarks A face is as tall as the track. The first and last face of each track carry the camera's
 * seam between its lenses, with a duplicated band of `(width - 3 * height) / 2` columns, so the
 * layout follows from the track size alone: 64-pixel bands on the MAX2 at 8K, 32 on the MAX at
 * 5.6K. Texture 0 is the first track (left, front, right), texture 1 the second (down, back, up),
 * oriented as measured on MAX2 frames (FORMAT-gopro.md). A track narrower than three faces throws
 * {@link UnsupportedLayoutError}.
 */
export function goproCubeMap(track: { readonly width: number; readonly height: number }): CubeMap {
  const size = track.height;
  const band = (track.width - FACES_PER_TRACK * size) / SEAMED_PER_TRACK;
  if (!(band >= 0) || !Number.isSafeInteger(band)) {
    throw new UnsupportedLayoutError(
      `a ${track.width} by ${track.height} track is not three faces`,
    );
  }
  return {
    faces: TRACKS.flatMap((faces, texture) => {
      let x = 0;
      return faces.map(({ seamed, ...axes }): CubeFace => {
        const face: CubeFace = { texture, origin: [x, 0], size, band: seamed ? band : 0, ...axes };
        x += size + face.band;
        return face;
      });
    }),
  };
}
