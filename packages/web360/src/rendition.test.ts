import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LensPicture } from '@web360/core';
import type { Codecs, DecoderPort } from '@web360/webcodecs';
import { create, globals } from 'webgpu';
import { describe, expect, it } from 'vitest';

import { Web360Error } from './errors';
import type { Platform, Presenter } from './platform';
import type { RenditionOptions } from './options';
import { openRendition } from './rendition';

Object.assign(globalThis, globals);

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../test/fixtures/insta360/oner-split-00.insv',
);
const bytes = new Uint8Array(readFileSync(fixture));
const file = new Blob([bytes]);
const both = { main: { blob: file }, second: { blob: file } };
const notARecording = new Blob([new Uint8Array(300)]);

// Kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);

// One solid colour per lens, in the order the decoders are made.
const LENS_COLOURS = [
  [230, 40, 40],
  [40, 40, 230],
] as const;

interface FakeFrame {
  readonly timestamp: number;
  readonly colour: readonly number[];
  readonly displayWidth: number;
  readonly displayHeight: number;
  close(): void;
}

interface Presented {
  readonly timestamp: number;
  readonly duration: number;
  readonly pixels: Uint8Array;
  close(): void;
}

interface Fakes {
  readonly platform: Platform;
  readonly open: { frames: number; decoders: number };
}

const fakeCodecs = (
  fakes: { open: { frames: number; decoders: number } },
  failAfter?: number,
): Codecs => {
  let made = 0;
  return {
    createChunk: (init) => init as unknown as EncodedVideoChunk,
    createDecoder: (init): DecoderPort => {
      const colour = LENS_COLOURS[made % 2] ?? [0, 0, 0];
      made += 1;
      fakes.open.decoders += 1;
      const held: number[] = [];
      let fed = 0;
      const emit = (timestamp: number): void => {
        fakes.open.frames += 1;
        const frame: FakeFrame = {
          timestamp,
          colour,
          displayWidth: 2880,
          displayHeight: 2880,
          close: () => {
            fakes.open.frames -= 1;
          },
        };
        init.output(frame as unknown as VideoFrame);
      };
      const release = (): void => {
        held.sort((a, b) => a - b);
        const first = held.shift();
        if (first !== undefined) emit(first);
      };
      const decoder: DecoderPort = {
        decodeQueueSize: 0,
        ondequeue: null,
        configure: (): void => {
          // The fake decodes any configuration.
        },
        decode: (chunk) => {
          fed += 1;
          if (failAfter !== undefined && fed > failAfter) {
            init.error(new DOMException('corrupt frame', 'EncodingError'));
            return;
          }
          held.push((chunk as unknown as EncodedVideoChunkInit).timestamp);
          if (held.length > 3) release();
        },
        flush: () => {
          while (held.length > 0) release();
          return Promise.resolve();
        },
        close: () => {
          fakes.open.decoders -= 1;
        },
      };
      return decoder;
    },
  };
};

const presenterOn = (device: GPUDevice, size: { width: number; height: number }): Presenter => {
  const texture = device.createTexture({
    size: [size.width, size.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const bytesPerRow = Math.ceil((size.width * 4) / 256) * 256;
  return {
    format: 'rgba8unorm',
    target: () => texture,
    capture: async (timing): Promise<VideoFrame> => {
      const buffer = device.createBuffer({
        size: bytesPerRow * size.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [size.width, size.height]);
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const pixels = Uint8Array.from(new Uint8Array(buffer.getMappedRange()));
      buffer.destroy();
      const presented: Presented = {
        ...timing,
        pixels,
        close: (): void => {
          // Read back already: nothing to release.
        },
      };
      return presented as unknown as VideoFrame;
    },
    destroy: (): void => {
      texture.destroy();
    },
  };
};

const fakePlatform = (
  options: { readonly failAfter?: number; readonly decodable?: boolean } = {},
): Fakes => {
  const open = { frames: 0, decoders: 0 };
  const platform: Platform = {
    codecs: fakeCodecs({ open }, options.failAfter),
    ensureDecodable: () =>
      options.decodable === false
        ? Promise.reject(new Web360Error('codec-unsupported', 'no decoder'))
        : Promise.resolve(),
    device: async () => {
      const adapter = await gpu.requestAdapter();
      if (adapter === null) throw new Error('no WebGPU adapter: the rendition tests need one');
      return adapter.requestDevice();
    },
    presenter: presenterOn,
    upload: (device, frame, texture) => {
      const { colour } = frame as unknown as FakeFrame;
      const row = new Uint8Array(texture.width * 4).map((...[, index]) =>
        index % 4 === 3 ? 255 : (colour[index % 4] ?? 0),
      );
      for (let y = 0; y < texture.height; y += 1) {
        device.queue.writeTexture({ texture, origin: [0, y] }, row, {}, [texture.width, 1]);
      }
    },
    picture: (frame, size): LensPicture => {
      const { colour } = frame as unknown as FakeFrame;
      const rgba = new Uint8Array(size * size * 4).map((...[, index]) =>
        index % 4 === 3 ? 255 : (colour[index % 4] ?? 0),
      );
      return { width: size, height: size, rgba };
    },
  };
  return { platform, open };
};

const render = async (
  fakes: Fakes,
  options: Partial<RenditionOptions> = {},
): Promise<Presented[]> => {
  const rendition = await openRendition(both, {
    width: 64,
    from: 0,
    to: 0.1,
    platform: fakes.platform,
    ...options,
  });
  const frames: Presented[] = [];
  try {
    for await (const frame of rendition.frames()) frames.push(frame as unknown as Presented);
  } finally {
    rendition.dispose();
  }
  return frames;
};

// The red, green and blue of every pixel a lens lit (not the black of uncovered directions).
const litPixels = (frame: Presented | undefined): [number, number, number][] => {
  const pixels = frame?.pixels ?? new Uint8Array();
  const lit: [number, number, number][] = [];
  for (let at = 0; at < pixels.length; at += 4) {
    const pixel: [number, number, number] = [
      pixels[at] ?? 0,
      pixels[at + 1] ?? 0,
      pixels[at + 2] ?? 0,
    ];
    if (pixel[0] + pixel[1] + pixel[2] > 30) lit.push(pixel);
  }
  return lit;
};

describe('a rendition of a recording', () => {
  it('describes the recording and the span', async () => {
    const rendition = await openRendition(both, {
      width: 64,
      from: 1,
      to: 1.5,
      platform: fakePlatform().platform,
    });
    expect(rendition.metadata.model).toBe('Insta360 OneR');
    expect(rendition.metadata.duration).toBeCloseTo(4299 / (30_000 / 1001), 2);
    expect(rendition.duration).toBeCloseTo(0.5, 9);
    rendition.dispose();
  });

  it('stitches the span frame by frame, timed from its start, from both lenses', async () => {
    const fakes = fakePlatform();
    const frames = await render(fakes);
    expect(frames.map((frame) => frame.timestamp)).toEqual([0, 33_367, 66_733]);
    expect(frames[0]?.duration).toBeCloseTo(1_000_000 / (30_000 / 1001), 6);
    // Matched, two solid lenses agree: every lit pixel has the same colour.
    const reds = litPixels(frames[0]).map((pixel) => pixel[0]);
    expect(Math.max(...reds) - Math.min(...reds)).toBeLessThanOrEqual(8);
    expect(fakes.open).toEqual({ frames: 0, decoders: 0 });
  });

  it('shows each lens as recorded without colour matching', async () => {
    const frames = await render(fakePlatform(), { gainMatching: false, stabilization: 'off' });
    expect(frames).toHaveLength(3);
    const pixels = litPixels(frames[0]);
    expect(pixels.some(([red, , blue]) => red > blue + 50)).toBe(true);
    expect(pixels.some(([red, , blue]) => blue > red + 50)).toBe(true);
  });

  it('refuses a split recording opened without its second file', async () => {
    await expect(
      openRendition({ main: { blob: file } }, { width: 64, platform: fakePlatform().platform }),
    ).rejects.toMatchObject({ code: 'missing-second-file' });
  });

  it('refuses files that are not a recording', async () => {
    await expect(
      openRendition(
        { main: { blob: notARecording } },
        { width: 64, platform: fakePlatform().platform },
      ),
    ).rejects.toMatchObject({ code: 'unreadable-recording' });
  });

  it('refuses a video this browser cannot decode', async () => {
    await expect(
      openRendition(both, { width: 64, platform: fakePlatform({ decodable: false }).platform }),
    ).rejects.toMatchObject({ code: 'codec-unsupported' });
  });

  it('reports a decoder failure partway as a decode error and releases what it held', async () => {
    const fakes = fakePlatform({ failAfter: 4 });
    await expect(render(fakes, { to: 0.2 })).rejects.toMatchObject({ code: 'decode' });
    expect(fakes.open).toEqual({ frames: 0, decoders: 0 });
  });

  it('stops when cancelled', async () => {
    const fakes = fakePlatform();
    const controller = new AbortController();
    const rendition = await openRendition(both, {
      width: 64,
      to: 0.2,
      platform: fakes.platform,
      signal: controller.signal,
    });
    const frames = rendition.frames();
    const first = await frames.next();
    expect(first.done).toBe(false);
    controller.abort(new Error('canceled'));
    await expect(frames.next()).rejects.toThrow(/canceled/);
    rendition.dispose();
    expect(fakes.open).toEqual({ frames: 0, decoders: 0 });
  });

  it('releases what it holds when the caller stops early', async () => {
    const fakes = fakePlatform();
    const rendition = await openRendition(both, { width: 64, to: 0.1, platform: fakes.platform });
    const frames = rendition.frames();
    await frames.next();
    await frames.return(undefined);
    rendition.dispose();
    expect(fakes.open).toEqual({ frames: 0, decoders: 0 });
  });
});
