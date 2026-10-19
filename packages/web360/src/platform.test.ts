import type { EncodedVideo } from '@web360/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserPlatform } from './platform';

const video: EncodedVideo = {
  codec: 'avc1.4d4034',
  decoderConfig: Uint8Array.from([1]),
  width: 2880,
  height: 2880,
  frames: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the browser platform', () => {
  it('reports a browser without WebCodecs', async () => {
    vi.stubGlobal('VideoDecoder', undefined);
    await expect(browserPlatform().ensureDecodable(video)).rejects.toMatchObject({
      code: 'webcodecs-unavailable',
    });
  });

  it('asks the decoder whether it takes the codec, and reports when it does not', async () => {
    const isConfigSupported =
      vi.fn<(config: VideoDecoderConfig) => Promise<{ supported: boolean }>>();
    vi.stubGlobal('VideoDecoder', { isConfigSupported });
    isConfigSupported.mockResolvedValueOnce({ supported: true });
    await expect(browserPlatform().ensureDecodable(video)).resolves.toBeUndefined();
    expect(isConfigSupported.mock.calls[0]?.[0]).toMatchObject({
      codec: 'avc1.4d4034',
      codedWidth: 2880,
    });
    isConfigSupported.mockResolvedValueOnce({ supported: false });
    await expect(browserPlatform().ensureDecodable(video)).rejects.toMatchObject({
      code: 'codec-unsupported',
    });
  });

  it('reports a browser without WebGPU, or without an adapter', async () => {
    vi.stubGlobal('navigator', {});
    await expect(browserPlatform().device()).rejects.toMatchObject({ code: 'render-unavailable' });
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve(null) } });
    await expect(browserPlatform().device()).rejects.toMatchObject({ code: 'render-unavailable' });
  });

  it('opens a device on the adapter it is given', async () => {
    const device = { label: 'device' };
    const adapter = { requestDevice: (): Promise<unknown> => Promise.resolve(device) };
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve(adapter) } });
    await expect(browserPlatform().device()).resolves.toBe(device);
  });

  it('copies a frame onto its texture, no larger than either', () => {
    const copy = vi.fn();
    const device = { queue: { copyExternalImageToTexture: copy } } as unknown as GPUDevice;
    const texture = { width: 2880, height: 2880 } as GPUTexture;
    const frame = { displayWidth: 3000, displayHeight: 2000 } as VideoFrame;
    browserPlatform().upload(device, frame, texture);
    expect(copy).toHaveBeenCalledWith({ source: frame }, { texture }, [2880, 2000]);
  });

  it('draws a frame small into a picture', () => {
    const drawImage = vi.fn();
    const data = new Uint8ClampedArray(4 * 4 * 4);
    class Canvas {
      public getContext(): unknown {
        return { drawImage, getImageData: () => ({ data }) };
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    const frame = {} as VideoFrame;
    expect(browserPlatform().picture(frame, 4)).toEqual({ width: 4, height: 4, rgba: data });
    expect(drawImage).toHaveBeenCalledWith(frame, 0, 0, 4, 4);
  });

  it('reports a browser that will not give a canvas', () => {
    class Canvas {
      public getContext(): unknown {
        return null;
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    expect(() => browserPlatform().picture({} as VideoFrame, 4)).toThrow(/canvas/);
    expect(() => browserPlatform().presenter({} as GPUDevice, { width: 8, height: 4 })).toThrow(
      /canvas/,
    );
  });

  it('presents on a WebGPU canvas and captures it as a video frame', async () => {
    const configure = vi.fn();
    const unconfigure = vi.fn();
    const texture = { label: 'current' };
    class Canvas {
      public getContext(): unknown {
        return { configure, unconfigure, getCurrentTexture: () => texture };
      }
    }
    class Frame {
      public readonly source: unknown;
      public readonly init: unknown;

      public constructor(source: unknown, init: unknown) {
        this.source = source;
        this.init = init;
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    vi.stubGlobal('VideoFrame', Frame);
    vi.stubGlobal('navigator', { gpu: { getPreferredCanvasFormat: () => 'bgra8unorm' } });
    const device = {} as GPUDevice;
    const presenter = browserPlatform().presenter(device, { width: 8, height: 4 });
    expect(presenter.format).toBe('bgra8unorm');
    expect(configure).toHaveBeenCalledWith({ device, format: 'bgra8unorm', alphaMode: 'opaque' });
    expect(presenter.target()).toBe(texture);
    const captured = (await presenter.capture({ timestamp: 5, duration: 2 })) as unknown as Frame;
    expect(captured.init).toEqual({ timestamp: 5, duration: 2 });
    presenter.destroy();
    expect(unconfigure).toHaveBeenCalled();
  });
});
