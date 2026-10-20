import type { EncodedVideo } from '@web360/core';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

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

// A stand-in device. One whose import of a frame fails, the way headless Linux Chromium's does,
// never completes the work it submits.
const standInDevice = (
  spies: { writeTexture: Mock; destroy: Mock; importExternalTexture?: Mock },
  canImport = false,
): GPUDevice =>
  ({
    createShaderModule: (): unknown => ({}),
    createSampler: (): unknown => ({}),
    createTexture: (): unknown => ({ format: 'rgba8unorm', createView: () => ({}) }),
    createRenderPipeline: () => ({ getBindGroupLayout: (): unknown => ({}) }),
    createBindGroup: (): unknown => ({}),
    importExternalTexture: spies.importExternalTexture ?? ((): unknown => ({})),
    createCommandEncoder: (): unknown => ({
      beginRenderPass: () => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      }),
      finish: () => ({}),
    }),
    queue: {
      submit: vi.fn(),
      writeTexture: spies.writeTexture,
      onSubmittedWorkDone: () =>
        canImport
          ? Promise.resolve()
          : Promise.reject(new Error('A valid external Instance reference no longer exists.')),
    },
    lost: new Promise<never>(() => {
      // A lost device would settle this; this one only fails its work.
    }),
    destroy: spies.destroy,
  }) as unknown as GPUDevice;

// WebGPU's usage flags, which Node does not define: the probe's texture asks for one.
const TEXTURE_USAGE: unknown = Object.fromEntries([['RENDER_ATTACHMENT', 16]]);

class Canvas {
  public getContext(): unknown {
    return { fillRect: vi.fn() };
  }
}
class Frame {
  public close = vi.fn();
}

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

  it('draws each frame onto its texture from an imported external texture', async () => {
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
    await platform.upload(device, frame, texture);
    await platform.upload(device, frame, texture);
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

  describe('where a browser cannot hand decoded frames to WebGPU', () => {
    it('checks once on a spare device, and copies frames on the CPU instead', async () => {
      const realSpies = { writeTexture: vi.fn(), destroy: vi.fn() };
      const spareSpies = { writeTexture: vi.fn(), destroy: vi.fn() };
      const real = standInDevice(realSpies);
      const spare = standInDevice(spareSpies);
      // Each adapter makes its own device: a failed import loses every adapter fetched before it,
      // so the device to render on must come from one fetched after the check.
      const adapters = [spare, real].map((device) => ({
        requestDevice: (): Promise<GPUDevice> => Promise.resolve(device),
      }));
      const requestAdapter = vi.fn(() => Promise.resolve(adapters.shift()));
      vi.stubGlobal('navigator', { gpu: { requestAdapter } });
      vi.stubGlobal('OffscreenCanvas', Canvas);
      vi.stubGlobal('VideoFrame', Frame);
      vi.stubGlobal('GPUTextureUsage', TEXTURE_USAGE);
      const platform = browserPlatform();
      const device = await platform.device();
      expect(device).toBe(real);
      expect(requestAdapter).toHaveBeenCalledTimes(2);
      expect(spareSpies.destroy).toHaveBeenCalled();

      const copyTo = vi.fn(() => Promise.resolve([]));
      const frame = {
        codedWidth: 4,
        codedHeight: 2,
        visibleRect: { x: 0, y: 0, width: 4, height: 2 },
        copyTo,
      } as unknown as VideoFrame;
      const texture = { width: 4, height: 2, format: 'rgba8unorm' } as unknown as GPUTexture;
      await platform.upload(device, frame, texture);
      expect(copyTo).toHaveBeenCalledWith(expect.any(Uint8Array), { format: 'RGBA' });
      expect(realSpies.writeTexture).toHaveBeenCalledWith(
        { texture },
        expect.any(Uint8Array),
        { bytesPerRow: 16 },
        [4, 2],
      );
    });
  });

  describe('where a browser can import decoded frames', () => {
    it('keeps importing them, after the check on a spare device', async () => {
      const importExternalTexture = vi.fn(() => ({}));
      const spies = { writeTexture: vi.fn(), destroy: vi.fn(), importExternalTexture };
      const [spare, real] = [standInDevice(spies, true), standInDevice(spies)];
      const adapters = [spare, real].map((device) => ({
        requestDevice: (): Promise<GPUDevice> => Promise.resolve(device),
      }));
      vi.stubGlobal('navigator', {
        gpu: { requestAdapter: () => Promise.resolve(adapters.shift()) },
      });
      vi.stubGlobal('OffscreenCanvas', Canvas);
      vi.stubGlobal('VideoFrame', Frame);
      vi.stubGlobal('GPUTextureUsage', TEXTURE_USAGE);
      const platform = browserPlatform();
      const device = await platform.device();
      importExternalTexture.mockClear();
      const texture = { format: 'rgba8unorm', createView: () => ({}) } as unknown as GPUTexture;
      await platform.upload(device, {} as VideoFrame, texture);
      expect(importExternalTexture).toHaveBeenCalledTimes(1);
      expect(spies.writeTexture).not.toHaveBeenCalled();
    });

    it('takes a check that finds no spare adapter at its word', async () => {
      const spies = { writeTexture: vi.fn(), destroy: vi.fn() };
      const real = standInDevice(spies);
      const adapters = [null, { requestDevice: (): Promise<GPUDevice> => Promise.resolve(real) }];
      vi.stubGlobal('navigator', {
        gpu: { requestAdapter: () => Promise.resolve(adapters.shift()) },
      });
      vi.stubGlobal('OffscreenCanvas', Canvas);
      vi.stubGlobal('VideoFrame', Frame);
      vi.stubGlobal('GPUTextureUsage', TEXTURE_USAGE);
      await expect(browserPlatform().device()).resolves.toBe(real);
    });
  });
});
