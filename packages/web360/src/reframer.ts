import { packView } from '@web360/core';
import { createViewRenderer } from '@web360/webgpu';

import { frameTextures } from './frameSize';
import { browserPlatform, type Platform } from './platform';
import { toCoreView, type View } from './views';

/** How to reframe: the output size in pixels and, outside a browser, the platform. */
export interface ReframerOptions {
  readonly width: number;
  readonly height: number;
  readonly platform?: Platform;
}

/**
 * Turns equirectangular video frames into flat views of them, one frame at a time.
 *
 * @remarks `reframe` draws the view of `frame` and returns it as a new `VideoFrame` of the
 * reframer's size with the same timestamp and duration, ready for an encoder; the caller closes
 * both frames. Calls are taken one at a time: await each before the next. `destroy` releases the GPU
 * device.
 */
export interface Reframer {
  reframe(frame: VideoFrame, view: View): Promise<VideoFrame>;
  destroy(): void;
}

/**
 * Opens a reframer: the way to export a keyframed flat video from a 360 one.
 *
 * @remarks It needs a WebGPU device and throws a `Web360Error` (`render-unavailable`) without one.
 * Decoding the 360 video and encoding the result are the caller's (with WebCodecs, or a library
 * over it): the reframer only draws, so it takes frames from any decoder. Pick each frame's view
 * with {@link viewAt}.
 */
export async function createReframer(options: ReframerOptions): Promise<Reframer> {
  const platform = options.platform ?? browserPlatform();
  const device = await platform.device();
  const size = { width: options.width, height: options.height };
  const presenter = platform.presenter(device, size);
  const renderer = createViewRenderer(device, presenter.format);
  const textures = frameTextures(device);
  return {
    reframe: async (frame, view): Promise<VideoFrame> => {
      const texture = textures.forFrame(frame);
      await platform.upload(device, frame, texture);
      renderer.render({ packed: packView(toCoreView(view), size), texture }, presenter.target());
      return presenter.capture({
        timestamp: frame.timestamp,
        duration: frame.duration ?? 0,
      });
    },
    destroy: (): void => {
      textures.destroy();
      renderer.destroy();
      presenter.destroy();
      device.destroy();
    },
  };
}
