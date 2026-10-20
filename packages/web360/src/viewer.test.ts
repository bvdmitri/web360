import type { LensPicture } from '@web360/core';
import { browserCodecs } from '@web360/webcodecs';
import { create, globals } from 'webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Web360Error } from './errors';
import type { Platform } from './platform';
import { readbackPresenter } from './presenter';
import { createViewer } from './viewer';
import { DEFAULT_VIEW } from './views';

Object.assign(globalThis, globals);

// Kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);

const RED = [230, 30, 30] as const;
const BLUE = [30, 30, 230] as const;
const SIZE = { width: 32, height: 18 };

const frameOf = (closed: { count: number }): VideoFrame =>
  ({
    codedWidth: 64,
    codedHeight: 32,
    visibleRect: null,
    timestamp: 0,
    duration: null,
    close: (): void => {
      closed.count += 1;
    },
  }) as unknown as VideoFrame;

const paint = (device: GPUDevice, texture: GPUTexture): void => {
  const row = new Uint8Array(texture.width * 4).map((...[, index]) => {
    const half = Math.floor(index / 4) < texture.width / 2 ? RED : BLUE;
    return index % 4 === 3 ? 255 : (half[index % 4] ?? 0);
  });
  for (let y = 0; y < texture.height; y += 1) {
    device.queue.writeTexture({ texture, origin: [0, y] }, row, {}, [texture.width, 1]);
  }
};

const devices: GPUDevice[] = [];

const platform: Platform = {
  codecs: browserCodecs(),
  ensureDecodable: () => Promise.resolve(),
  device: async () => {
    const adapter = await gpu.requestAdapter();
    if (adapter === null) throw new Error('no WebGPU adapter: the viewer tests need one');
    const device = await adapter.requestDevice();
    devices.push(device);
    return device;
  },
  presenter: (device, size) => readbackPresenter(device, size),
  upload: (...[device, , texture]): void => {
    paint(device, texture);
  },
  picture: (): LensPicture => ({ width: 0, height: 0, rgba: new Uint8Array() }),
};

// A canvas whose WebGPU context draws into a texture the test reads back.
const fakeCanvas = (): {
  canvas: HTMLCanvasElement;
  configured: GPUCanvasConfiguration[];
  current: () => GPUTexture | undefined;
  unconfigured: () => boolean;
} => {
  const configured: GPUCanvasConfiguration[] = [];
  let texture: GPUTexture | undefined;
  let isUnconfigured = false;
  const context = {
    configure: (configuration: GPUCanvasConfiguration): void => {
      configured.push(configuration);
      texture = configuration.device.createTexture({
        size: [SIZE.width, SIZE.height],
        format: configuration.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    },
    unconfigure: (): void => {
      isUnconfigured = true;
    },
    getCurrentTexture: (): GPUTexture | undefined => texture,
  };
  const canvas = { ...SIZE, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, configured, current: () => texture, unconfigured: () => isUnconfigured };
};

const middleOf = async (device: GPUDevice, texture: GPUTexture): Promise<number[]> => {
  const stride = 256;
  const buffer = device.createBuffer({
    size: stride * SIZE.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: stride }, [
    SIZE.width,
    SIZE.height,
  ]);
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const at = Math.floor(SIZE.height / 2) * stride + Math.floor(SIZE.width / 2) * 4;
  const pixel = [...new Uint8Array(buffer.getMappedRange()).slice(at, at + 3)];
  buffer.unmap();
  return pixel;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the viewer', () => {
  it('draws the view of a frame onto its canvas, and leaves the frame open', async () => {
    const fake = fakeCanvas();
    const viewer = await createViewer(fake.canvas, { format: 'rgba8unorm', platform });
    const device = devices.at(-1);
    const closed = { count: 0 };
    await viewer.draw(frameOf(closed), { ...DEFAULT_VIEW, pan: -90 });
    const texture = fake.current();
    if (device === undefined || texture === undefined) throw new Error('no canvas texture');
    expect(await middleOf(device, texture)).toEqual([...RED]);
    await viewer.draw(frameOf(closed), { ...DEFAULT_VIEW, pan: 90 });
    expect(await middleOf(device, texture)).toEqual([...BLUE]);
    expect(closed.count).toBe(0);
    expect(fake.configured[0]).toMatchObject({ format: 'rgba8unorm', alphaMode: 'opaque' });
    viewer.destroy();
    expect(fake.unconfigured()).toBe(true);
  });

  it('draws a video element through a frame of its own, closed after', async () => {
    const closed = { count: 0 };
    const made: unknown[] = [];
    vi.stubGlobal(
      'VideoFrame',
      vi.fn(function videoFrame(source: unknown) {
        made.push(source);
        return frameOf(closed);
      }),
    );
    const fake = fakeCanvas();
    const viewer = await createViewer(fake.canvas, { format: 'rgba8unorm', platform });
    const video = { readyState: 4 } as unknown as HTMLVideoElement;
    await viewer.draw(video, DEFAULT_VIEW);
    viewer.destroy();
    expect(made).toEqual([video]);
    expect(closed.count).toBe(1);
  });

  it('refuses a canvas without a WebGPU context', async () => {
    const canvas = { ...SIZE, getContext: () => null } as unknown as HTMLCanvasElement;
    await expect(createViewer(canvas, { platform })).rejects.toThrow(Web360Error);
  });
});
