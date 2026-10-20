import type { CubeMap } from '../model/cube';
import { cubeSamples } from '../optics/eac';
import { rotate, type Quaternion } from '../shared/math/quaternion';
import { toDirection } from './equirectangular';
import type { Rgb } from './sampler';

const PIXEL_CENTRE = 0.5;
const BLACK: Rgb = [0, 0, 0];

/** Reads a texture's colour at a pixel, in texture pixels with a texel's centre at `+0.5`. */
export type TextureSampler = (pixel: readonly [number, number]) => Rgb;

/** A cube-map frame to render: the cube, a sampler per texture, the view's turn and the size. */
export interface CubeScene {
  readonly cube: CubeMap;
  readonly samplers: readonly TextureSampler[];
  readonly correction: Quaternion;
  readonly width: number;
  readonly height: number;
}

/**
 * Renders an equirectangular frame from an equi-angular cube map on the CPU, row-major.
 *
 * @remarks The reference for the cube-map shader, as {@link renderEquirectangular} is for the lens
 * stitch: each output direction is turned by `correction` into the cube's frame and read where the
 * cube stores it, both copies blended across a seam band. A texture without a sampler reads black.
 */
export function renderCubeMap(scene: CubeScene): Rgb[] {
  const pixels: Rgb[] = [];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const direction = rotate(
        scene.correction,
        toDirection((x + PIXEL_CENTRE) / scene.width, (y + PIXEL_CENTRE) / scene.height),
      );
      const colour: [number, number, number] = [0, 0, 0];
      for (const sample of cubeSamples(scene.cube, direction)) {
        const read = scene.samplers[sample.texture]?.(sample.pixel) ?? BLACK;
        colour[0] += sample.weight * read[0];
        colour[1] += sample.weight * read[1];
        colour[2] += sample.weight * read[2];
      }
      pixels.push(colour);
    }
  }
  return pixels;
}
