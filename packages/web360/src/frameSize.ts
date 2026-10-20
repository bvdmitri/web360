/** A decoded frame's visible size, which is what a texture made for it holds. */
export function frameSize(frame: VideoFrame): { readonly width: number; readonly height: number } {
  return {
    width: frame.visibleRect?.width ?? frame.codedWidth,
    height: frame.visibleRect?.height ?? frame.codedHeight,
  };
}

/**
 * A texture for one equirectangular frame: sampled by a view, written by a frame copier (by a
 * draw or by `writeTexture`).
 */
export function frameTexture(
  device: GPUDevice,
  size: { readonly width: number; readonly height: number },
): GPUTexture {
  return device.createTexture({
    size: [size.width, size.height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

/** Keeps one frame texture, made again when a frame of another size arrives. */
export interface FrameTextures {
  /** The texture for a frame of this size. */
  forFrame(frame: VideoFrame): GPUTexture;
  destroy(): void;
}

/** A {@link FrameTextures} on `device`. */
export function frameTextures(device: GPUDevice): FrameTextures {
  let current: GPUTexture | undefined;
  return {
    forFrame: (frame): GPUTexture => {
      const size = frameSize(frame);
      if (current?.width !== size.width || current.height !== size.height) {
        current?.destroy();
        current = frameTexture(device, size);
      }
      return current;
    },
    destroy: (): void => {
      current?.destroy();
      current = undefined;
    },
  };
}
