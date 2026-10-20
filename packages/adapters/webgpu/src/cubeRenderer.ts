import { CUBE_SHADER } from './cubeShader';
import { createPass, type Pass, type PassFrame } from './pass';

/** One frame for the {@link CubeRenderer}: the packed cube map and its two textures. */
export type CubeRendererFrame = PassFrame;

/** Renders equirectangular frames from cube maps on one GPU device. */
export type CubeRenderer = Pass;

/**
 * Creates a renderer that draws the core's packed cube-map frame (`packCube`) on `device` into
 * textures of `format`.
 *
 * @remarks The cube's textures are the camera's video tracks as decoded, in the order its faces
 * name them (`CubeFace.texture`), copied into sampled textures by the caller as for the stitcher.
 * There is no colour work: the camera already matched its lenses, and only a seam band's two
 * copies are blended.
 */
export function createCubeRenderer(device: GPUDevice, format: GPUTextureFormat): CubeRenderer {
  return createPass(device, { code: CUBE_SHADER, format, missing: 'no cube texture to render' });
}
