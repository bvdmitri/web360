import { packView } from '@web360/core';
import { createViewRenderer } from '@web360/webgpu';

import { Web360Error } from './errors';
import { frameTextures } from './frameSize';
import { browserPlatform, type Platform } from './platform';
import { toCoreView, type View } from './views';

/** A canvas a viewer draws on: a page's canvas, or an `OffscreenCanvas` in a worker. */
export type ViewerCanvas = HTMLCanvasElement | OffscreenCanvas;

/** What a viewer shows: a decoded frame, or a playing `<video>` as it is now. */
export type ViewerSource = VideoFrame | HTMLVideoElement;

/**
 * How to open a viewer: the canvas's texture format (the browser's preferred one unless given) and,
 * outside a browser, the platform.
 */
export interface ViewerOptions {
  readonly format?: GPUTextureFormat;
  readonly platform?: Platform;
}

/**
 * Draws views of an equirectangular video on a canvas, for looking around in a 360 video.
 *
 * @remarks `draw` shows `source` as `view` sees it, filling the canvas at its current `width` and
 * `height`; the caller sizes the canvas (to its box times the device pixel ratio, say) and calls
 * `draw` when the frame or the view changes, such as on each `requestVideoFrameCallback` and each
 * drag. A `<video>` must have a frame to show (`readyState` of 2 or more). It plays nothing and
 * keeps no state but the GPU's: the clock and the input are the page's. `destroy` releases the GPU
 * device.
 */
export interface Viewer {
  draw(source: ViewerSource, view: View): Promise<void>;
  destroy(): void;
}

/**
 * Opens a {@link Viewer} on `canvas`.
 *
 * @remarks It needs a WebGPU device and a WebGPU context on the canvas, and throws a `Web360Error`
 * (`render-unavailable`) without either. Each frame is copied onto the GPU as a rendition's are:
 * imported where the browser can, read on the CPU where it cannot.
 */
export async function createViewer(
  canvas: ViewerCanvas,
  options: ViewerOptions = {},
): Promise<Viewer> {
  const platform = options.platform ?? browserPlatform();
  const device = await platform.device();
  const { context, format } = configured(canvas, { device, options });
  const renderer = createViewRenderer(device, format);
  const textures = frameTextures(device);
  return {
    draw: async (source, view): Promise<void> => {
      const frame = asFrame(source);
      try {
        const texture = textures.forFrame(frame);
        await platform.upload(device, frame, texture);
        const size = { width: canvas.width, height: canvas.height };
        const packed = packView(toCoreView(view), size);
        renderer.render({ packed, texture }, context.getCurrentTexture());
      } finally {
        if (frame !== source) frame.close();
      }
    },
    destroy: (): void => {
      textures.destroy();
      renderer.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}

function configured(
  canvas: ViewerCanvas,
  on: { readonly device: GPUDevice; readonly options: ViewerOptions },
): { readonly context: GPUCanvasContext; readonly format: GPUTextureFormat } {
  const context = canvas.getContext('webgpu');
  if (context === null) {
    on.device.destroy();
    throw new Web360Error('render-unavailable', 'the canvas has no WebGPU context');
  }
  const format = on.options.format ?? navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device: on.device, format, alphaMode: 'opaque' });
  return { context, format };
}

// A decoded frame as it is; a <video>'s current frame as a frame of its own, closed after the draw.
function asFrame(source: ViewerSource): VideoFrame {
  return 'codedWidth' in source ? source : new VideoFrame(source);
}
