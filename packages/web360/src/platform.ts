import type { EncodedVideo, LensPicture } from '@web360/core';
import { browserCodecs, type Codecs } from '@web360/webcodecs';

import { Web360Error } from './errors';

/** Where stitched frames are drawn and how each becomes a frame for the caller. */
export interface Presenter {
  readonly format: GPUTextureFormat;
  /** The texture the next frame is rendered into. */
  target(): GPUTexture;
  /** The frame just rendered, at the given time, as the caller receives it. */
  capture(timing: { readonly timestamp: number; readonly duration: number }): Promise<VideoFrame>;
  destroy(): void;
}

/**
 * What a rendition needs from its environment: decoders, a GPU device, a surface to present on,
 * and two ways to move a decoded frame (onto the GPU, and into a small picture for colour).
 *
 * @remarks {@link browserPlatform} is the browser's (WebCodecs, WebGPU, `OffscreenCanvas`); a test
 * supplies its own, which is how the rendition loop runs outside a browser.
 */
export interface Platform {
  readonly codecs: Codecs;
  /** Throws a `Web360Error` when the video cannot be decoded here. */
  ensureDecodable(video: EncodedVideo): Promise<void>;
  /** A GPU device; throws a `Web360Error` when there is none. */
  device(): Promise<GPUDevice>;
  presenter(
    device: GPUDevice,
    size: { readonly width: number; readonly height: number },
  ): Presenter;
  upload(device: GPUDevice, frame: VideoFrame, texture: GPUTexture): void;
  picture(frame: VideoFrame, size: number): LensPicture;
}

/** The browser as a {@link Platform}: WebCodecs to decode, WebGPU to stitch, `OffscreenCanvas` to present. */
export function browserPlatform(): Platform {
  return {
    codecs: browserCodecs(),
    ensureDecodable,
    device: requestDevice,
    presenter: canvasPresenter,
    upload: (device, frame, texture): void => {
      device.queue.copyExternalImageToTexture({ source: frame }, { texture }, [
        Math.min(frame.displayWidth, texture.width),
        Math.min(frame.displayHeight, texture.height),
      ]);
    },
    picture: (frame, size): LensPicture => {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Web360Error('render-unavailable', 'no 2D canvas');
      context.drawImage(frame, 0, 0, size, size);
      return { width: size, height: size, rgba: context.getImageData(0, 0, size, size).data };
    },
  };
}

async function ensureDecodable(video: EncodedVideo): Promise<void> {
  if (typeof VideoDecoder === 'undefined') {
    throw new Web360Error('webcodecs-unavailable', 'this browser has no WebCodecs');
  }
  const { supported } = await VideoDecoder.isConfigSupported({
    codec: video.codec,
    description: video.decoderConfig,
    codedWidth: video.width,
    codedHeight: video.height,
  });
  if (supported !== true) {
    throw new Web360Error('codec-unsupported', `this browser cannot decode ${video.codec}`);
  }
}

async function requestDevice(): Promise<GPUDevice> {
  const gpu = typeof navigator === 'object' && 'gpu' in navigator ? navigator.gpu : undefined;
  const adapter = await gpu?.requestAdapter();
  if (adapter === null || adapter === undefined) {
    throw new Web360Error('render-unavailable', 'this browser has no WebGPU adapter');
  }
  return adapter.requestDevice();
}

function canvasPresenter(
  device: GPUDevice,
  size: { readonly width: number; readonly height: number },
): Presenter {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('webgpu');
  if (context === null) throw new Web360Error('render-unavailable', 'no WebGPU canvas');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  return {
    format,
    target: () => context.getCurrentTexture(),
    capture: (timing) => Promise.resolve(new VideoFrame(canvas, timing)),
    destroy: (): void => {
      context.unconfigure();
    },
  };
}
