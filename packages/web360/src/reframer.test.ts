import type { LensPicture } from '@web360/core';
import { browserCodecs } from '@web360/webcodecs';
import { create, globals } from 'webgpu';
import { describe, expect, it } from 'vitest';

import type { Platform } from './platform';
import { readbackPresenter } from './presenter';
import { createReframer } from './reframer';
import { DEFAULT_VIEW } from './views';

Object.assign(globalThis, globals);

// Kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);

const RED = [230, 30, 30] as const;
const BLUE = [30, 30, 230] as const;

interface Presented {
  readonly timestamp: number;
  readonly duration: number;
  readonly width: number;
  readonly pixels: Uint8Array;
}

const EQUIRECTANGULAR = { width: 64, height: 32 };

const equirectangular = (timestamp: number, size = EQUIRECTANGULAR): VideoFrame =>
  ({
    codedWidth: size.width,
    codedHeight: size.height,
    visibleRect: null,
    timestamp,
    duration: 33_333,
    close: (): void => {
      // A plain object: nothing to release.
    },
  }) as unknown as VideoFrame;

// The left half of the frame (looking left of ahead) red, the right half blue.
const paint = (device: GPUDevice, texture: GPUTexture): void => {
  const row = new Uint8Array(texture.width * 4).map((...[, index]) => {
    const half = Math.floor(index / 4) < texture.width / 2 ? RED : BLUE;
    return index % 4 === 3 ? 255 : (half[index % 4] ?? 0);
  });
  for (let y = 0; y < texture.height; y += 1) {
    device.queue.writeTexture({ texture, origin: [0, y] }, row, {}, [texture.width, 1]);
  }
};

const platform = (uploads: { width: number }[]): Platform => ({
  codecs: browserCodecs(),
  ensureDecodable: () => Promise.resolve(),
  device: async (): Promise<GPUDevice> => {
    const adapter = await gpu.requestAdapter();
    if (adapter === null) throw new Error('no WebGPU adapter: the reframer tests need one');
    return adapter.requestDevice();
  },
  presenter: (device, size) =>
    readbackPresenter(device, size, (pixels, init) => {
      const presented: Presented = {
        timestamp: init.timestamp,
        duration: init.duration ?? 0,
        width: init.codedWidth,
        pixels,
      };
      return presented as unknown as VideoFrame;
    }),
  upload: (...[device, , texture]): void => {
    uploads.push({ width: texture.width });
    paint(device, texture);
  },
  picture: (): LensPicture => ({ width: 0, height: 0, rgba: new Uint8Array() }),
});

const middle = (frame: Presented): readonly number[] => {
  const stride = Math.ceil((frame.width * 4) / 256) * 256;
  const at =
    Math.floor(frame.pixels.length / stride / 2) * stride + Math.floor(frame.width / 2) * 4;
  return [...frame.pixels.slice(at, at + 3)];
};

describe('the reframer', () => {
  it('draws the view of each frame at its size, timed as the frame was', async () => {
    const uploads: { width: number }[] = [];
    const reframer = await createReframer({ width: 32, height: 18, platform: platform(uploads) });
    const left = (await reframer.reframe(equirectangular(0), {
      ...DEFAULT_VIEW,
      pan: -90,
    })) as unknown as Presented;
    const right = (await reframer.reframe(equirectangular(33_333), {
      ...DEFAULT_VIEW,
      pan: 90,
    })) as unknown as Presented;
    reframer.destroy();
    expect(middle(left)).toEqual([...RED]);
    expect(middle(right)).toEqual([...BLUE]);
    expect(left).toMatchObject({ timestamp: 0, duration: 33_333, width: 32 });
    expect(right.timestamp).toBe(33_333);
    expect(uploads).toEqual([{ width: 64 }, { width: 64 }]);
  });

  it('makes its frame texture again for a frame of another size', async () => {
    const uploads: { width: number }[] = [];
    const reframer = await createReframer({ width: 16, height: 16, platform: platform(uploads) });
    await reframer.reframe(equirectangular(0), DEFAULT_VIEW);
    await reframer.reframe(equirectangular(1, { width: 128, height: 64 }), DEFAULT_VIEW);
    reframer.destroy();
    expect(uploads).toEqual([{ width: 64 }, { width: 128 }]);
  });
});
