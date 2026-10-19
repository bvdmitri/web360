import type { LensOptics } from '../model/recording';
import { rotate, type Quaternion, type Vector3 } from '../shared/math/quaternion';
import { toDirection } from './equirectangular';
import { stitchSample } from './sample';

const PIXEL_CENTRE = 0.5;
const BLACK: Rgb = [0, 0, 0];
const UNITY: Rgb = [1, 1, 1];

/** A linear colour as red, green and blue in `[0, 1]`. */
export type Rgb = readonly [number, number, number];

/** Reads the colour a lens recorded at a pixel of its image. */
export type LensSampler = (pixel: readonly [number, number]) => Rgb;

/**
 * Everything a stitched frame needs: the lenses, a sampler for each, the stabilization correction
 * for this frame, and the output size.
 *
 * @remarks `gains` optionally scales each lens's colour per channel before blending, so the lenses
 * agree across the seam (see {@link estimateGains}); a lens without a gain is left as recorded.
 */
export interface Scene {
  readonly lenses: readonly LensOptics[];
  readonly samplers: readonly LensSampler[];
  readonly correction: Quaternion;
  readonly width: number;
  readonly height: number;
  readonly gains?: readonly Rgb[];
}

/**
 * Composites one equirectangular frame on the CPU, row-major, each pixel in `[0, 1]` colours.
 *
 * @remarks This is the reference stitch: for each output pixel it takes the direction
 * ({@link toDirection}), rotates it by the stabilization correction into the camera frame, asks
 * {@link stitchSample} which lenses see it, and blends their samplers by weight, each scaled by its
 * lens gain. It is the golden image the GPU shader is checked against and is fine for a
 * low-resolution preview, but it is too slow for full-resolution video, which the GPU adapter
 * handles. A direction no lens covers is black.
 */
export function renderEquirectangular(scene: Scene): Rgb[] {
  const pixels: Rgb[] = [];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const u = (x + PIXEL_CENTRE) / scene.width;
      const v = (y + PIXEL_CENTRE) / scene.height;
      const direction = rotate(scene.correction, toDirection(u, v));
      pixels.push(colourAt(scene, direction));
    }
  }
  return pixels;
}

/** The colour a lens's sampler reads at a pixel, or black when the lens has no sampler. */
export function sampleLens(
  samplers: readonly LensSampler[],
  lens: number,
  pixel: readonly [number, number],
): Rgb {
  const sampler = samplers[lens];
  return sampler === undefined ? BLACK : sampler(pixel);
}

function colourAt(scene: Scene, direction: Vector3): Rgb {
  const accumulator: [number, number, number] = [0, 0, 0];
  for (const contribution of stitchSample(scene.lenses, direction)) {
    const colour = sampleLens(scene.samplers, contribution.lens, contribution.pixel);
    const gain = scene.gains?.[contribution.lens] ?? UNITY;
    accumulator[0] += contribution.weight * colour[0] * gain[0];
    accumulator[1] += contribution.weight * colour[1] * gain[1];
    accumulator[2] += contribution.weight * colour[2] * gain[2];
  }
  return accumulator;
}
