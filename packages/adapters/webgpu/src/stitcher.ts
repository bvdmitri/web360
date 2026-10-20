import { createPass, type Pass, type PassFrame } from './pass';
import { STITCH_SHADER } from './shader';

/** One frame for the {@link Stitcher}: the packed stitch and the lens images it refers to. */
export type StitcherFrame = PassFrame;

/** Renders stitched frames on one GPU device. */
export type Stitcher = Pass;

/**
 * Creates a stitcher that renders the core's packed stitch (`packStitch`) on `device` into textures
 * of `format`.
 *
 * @remarks The lens images are sampled textures, one or two: `LensImage.texture` in the packed
 * frame names which. A camera with both lenses in one image passes that texture once. Decoded video
 * frames are copied into such textures by the caller (for a `VideoFrame`,
 * `copyExternalImageToTexture`), so the shader has one path to test. Each `render` submits its own
 * work; the packed buffer is reused while it fits.
 */
export function createStitcher(device: GPUDevice, format: GPUTextureFormat): Stitcher {
  return createPass(device, { code: STITCH_SHADER, format, missing: 'no lens image to stitch' });
}
