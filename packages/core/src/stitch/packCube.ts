import type { CubeFace, CubeMap } from '../model/cube';
import type { Quaternion } from '../shared/math/quaternion';

const SLOT = 4;

/** One cube-map frame as a renderer receives it: the {@link CubeScene} without its samplers. */
export interface CubeFrame {
  readonly cube: CubeMap;
  readonly correction: Quaternion;
  readonly width: number;
  readonly height: number;
}

/**
 * The packed layout in four-float slots: a header, then a fixed run of slots per face.
 *
 * @remarks Header slot 0 is the correction quaternion (`x, y, z, w`); slot 1 is the output width
 * and height and the face count. Each face then has, in order: its centre and texture index; its
 * `across` axis and size; its `down` axis and band; and its origin.
 */
export const CUBE_LAYOUT = { header: 2, faceSlots: 4 } as const;

/**
 * Packs one cube-map frame into the floats a GPU renderer reads, laid out as {@link CUBE_LAYOUT}
 * describes.
 *
 * @remarks The contract between the reference cube render (`renderCubeMap`) and a shader: the same
 * faces and correction reduced to numbers, so the shader finds a direction's face, its equi-angular
 * face coordinates and the band's two copies as `cubeSamples` does.
 */
export function packCube(frame: CubeFrame): Float32Array<ArrayBuffer> {
  const { faces } = frame.cube;
  const packed = new Float32Array(
    (CUBE_LAYOUT.header + faces.length * CUBE_LAYOUT.faceSlots) * SLOT,
  );
  const q = frame.correction;
  packed.set([q.x, q.y, q.z, q.w], 0);
  packed.set([frame.width, frame.height, faces.length, 0], SLOT);
  for (const [index, face] of faces.entries()) {
    packed.set(faceSlots(face), (CUBE_LAYOUT.header + index * CUBE_LAYOUT.faceSlots) * SLOT);
  }
  return packed;
}

function faceSlots(face: CubeFace): number[] {
  return [
    ...face.centre,
    face.texture,
    ...face.across,
    face.size,
    ...face.down,
    face.band,
    ...face.origin,
    0,
    0,
  ];
}
