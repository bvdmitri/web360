import { createPass, type Pass } from './pass';
import { VIEW_SHADER } from './viewShader';

/** One frame for the {@link ViewRenderer}: the packed view (`packView`) and the frame's texture. */
export interface ViewRendererFrame {
  readonly packed: Float32Array<ArrayBuffer>;
  readonly texture: GPUTexture;
}

/** Renders flat views of equirectangular frames on one GPU device. */
export interface ViewRenderer {
  /** Renders the view into `target`, a render attachment of the renderer's format. */
  render(frame: ViewRendererFrame, target: GPUTexture): void;
  /** Releases the GPU resources the renderer holds. */
  destroy(): void;
}

/**
 * Creates a renderer that draws the core's packed view of an equirectangular frame on `device`
 * into textures of `format`.
 *
 * @remarks The frame's texture is the equirectangular video frame as decoded, copied into a
 * sampled texture by the caller. The packed view carries the target's size, so the view is drawn
 * to fill a target of that size.
 */
export function createViewRenderer(device: GPUDevice, format: GPUTextureFormat): ViewRenderer {
  const pass: Pass = createPass(device, {
    code: VIEW_SHADER,
    format,
    missing: 'no frame to view',
    textures: 1,
    sampler: { addressModeU: 'repeat', addressModeV: 'clamp-to-edge' },
  });
  return {
    render: (frame, target): void => {
      pass.render({ packed: frame.packed, textures: [frame.texture] }, target);
    },
    destroy: (): void => {
      pass.destroy();
    },
  };
}
