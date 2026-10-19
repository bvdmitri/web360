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

  it('draws each frame onto its texture from an imported external texture', () => {
    const imported = vi.fn((descriptor: GPUExternalTextureDescriptor) => descriptor);
    const pipelines = vi.fn(() => ({ getBindGroupLayout: (): unknown => ({}) }));
    const draw = vi.fn();
    const submit = vi.fn();
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw,
      end: vi.fn(),
    };
    const device = {
      createShaderModule: (): unknown => ({}),
      createSampler: (): unknown => ({}),
      createRenderPipeline: pipelines,
      createBindGroup: (descriptor: GPUBindGroupDescriptor): unknown => descriptor,
      importExternalTexture: imported,
      createCommandEncoder: (): unknown => ({ beginRenderPass: () => pass, finish: () => ({}) }),
      queue: { submit },
    } as unknown as GPUDevice;
    const texture = {
      format: 'rgba8unorm',
      createView: (): unknown => ({}),
    } as unknown as GPUTexture;
    const frame = {} as VideoFrame;
    const platform = browserPlatform();
    platform.upload(device, frame, texture);
    platform.upload(device, frame, texture);
    expect(imported).toHaveBeenCalledWith({ source: frame });
    expect(pipelines).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledWith(3);
    expect(submit).toHaveBeenCalledTimes(2);
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
  });
});
