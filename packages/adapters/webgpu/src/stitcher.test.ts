import {
  degrees,
  devignette,
  fromRotationVector,
  identity,
  packStitch,
  renderEquirectangular,
  type LensOptics,
  type LensSampler,
  type Quaternion,
  type Rgb,
  type StitchFrame,
  type StitchLens,
} from '@web360/core';
import { create, globals } from 'webgpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStitcher } from './stitcher';

Object.assign(globalThis, globals);

// The GPU object is kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);
// Opened in a hook: requesting the adapter while the module loads crashes the native bindings.
const opened: GPUDevice[] = [];
const device = (): GPUDevice => opened[0]!;
beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error('no WebGPU adapter: the stitcher tests need one');
  opened.push(await adapter.requestDevice());
});

const SIZE = 64;
const OUTPUT: readonly [number, number] = [64, 32];
const BYTE = 255;

afterAll(() => {
  device().destroy();
});

const optics = (index: number): LensOptics => ({
  projection: 'equidistant',
  radius: 30,
  fieldOfView: degrees(190),
  coverage: degrees(196),
  center: [32 + index * SIZE, 31.5],
  orientation: {
    yaw: degrees(2),
    pitch: degrees(index * 180),
    roll: degrees(index * 3),
  },
});

const lens = (index: number): StitchLens => ({
  optics: optics(index),
  image: { texture: index, origin: [index * SIZE, 0], extent: [SIZE, SIZE] },
});

// A smooth, distinct picture per lens, so bilinear sampling differences stay small.
const texels = (index: number): Uint8Array<ArrayBuffer> => {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const at = (y * SIZE + x) * 4;
      data[at] = Math.round((x / (SIZE - 1)) * 200) + index * 40;
      data[at + 1] = Math.round((y / (SIZE - 1)) * 220);
      data[at + 2] = Math.round(128 + 100 * Math.sin((x + y) / 9 + index));
      data[at + 3] = BYTE;
    }
  }
  return data;
};

const texel = (data: Uint8Array, x: number, y: number): Rgb => {
  const cx = Math.min(SIZE - 1, Math.max(0, x));
  const cy = Math.min(SIZE - 1, Math.max(0, y));
  const at = (cy * SIZE + cx) * 4;
  return [(data[at] ?? 0) / BYTE, (data[at + 1] ?? 0) / BYTE, (data[at + 2] ?? 0) / BYTE];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Linear filtering as the GPU does it: canvas pixels are texel centres, clamped at the edge, and
// black outside the image.
const bilinear =
  (data: Uint8Array, image: StitchLens['image']): LensSampler =>
  (pixel) => {
    const x = (pixel[0] - image.origin[0]) * (SIZE / image.extent[0]);
    const y = (pixel[1] - image.origin[1]) * (SIZE / image.extent[1]);
    if (x < -0.5 || y < -0.5 || x > SIZE - 0.5 || y > SIZE - 0.5) return [0, 0, 0];
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const top = mix(texel(data, x0, y0), texel(data, x0 + 1, y0), fx);
    const bottom = mix(texel(data, x0, y0 + 1), texel(data, x0 + 1, y0 + 1), fx);
    return mix(top, bottom, fy);
  };

const upload = (data: Uint8Array<ArrayBuffer>): GPUTexture => {
  const texture = device().createTexture({
    size: [SIZE, SIZE],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device().queue.writeTexture({ texture }, data, { bytesPerRow: SIZE * 4 }, [SIZE, SIZE]);
  return texture;
};

const readBack = async (texture: GPUTexture): Promise<Uint8Array> => {
  const buffer = device().createBuffer({
    size: OUTPUT[0] * OUTPUT[1] * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device().createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: OUTPUT[0] * 4 }, OUTPUT);
  device().queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const bytes = Uint8Array.from(new Uint8Array(buffer.getMappedRange()));
  buffer.destroy();
  return bytes;
};

const stitchOnGpu = async (frame: StitchFrame): Promise<Uint8Array> => {
  const textures = [upload(texels(0)), upload(texels(1))];
  const target = device().createTexture({
    size: OUTPUT,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const stitcher = createStitcher(device(), 'rgba8unorm');
  stitcher.render({ packed: packStitch(frame), textures }, target);
  const bytes = await readBack(target);
  stitcher.destroy();
  for (const texture of [...textures, target]) texture.destroy();
  return bytes;
};

interface Difference {
  readonly largest: number;
  readonly mean: number;
}

const compare = (gpu: Uint8Array, cpu: readonly Rgb[]): Difference => {
  let largest = 0;
  let total = 0;
  for (const [index, colour] of cpu.entries()) {
    for (let channel = 0; channel < 3; channel += 1) {
      const expected = Math.min(1, colour[channel] ?? 0) * BYTE;
      const difference = Math.abs((gpu[index * 4 + channel] ?? 0) - expected);
      largest = Math.max(largest, difference);
      total += difference;
    }
  }
  return { largest, mean: total / (cpu.length * 3) };
};

const reference = (frame: StitchFrame): Rgb[] => {
  const lenses = frame.lenses.map((one) => one.optics);
  const samplers = frame.lenses.map((one, index) => bilinear(texels(index), one.image));
  return renderEquirectangular({
    lenses,
    samplers:
      frame.vignetting === undefined ? samplers : devignette(lenses, samplers, frame.vignetting),
    correction: frame.correction,
    width: frame.width,
    height: frame.height,
    ...(frame.gains !== undefined && { gains: frame.gains }),
    ...(frame.shutter !== undefined && { shutter: frame.shutter.sample }),
  });
};

const baseFrame: StitchFrame = {
  lenses: [lens(0), lens(1)],
  correction: fromRotationVector([0.2, -0.1, 0.4]),
  width: OUTPUT[0],
  height: OUTPUT[1],
};

// A turn down the rows, opposite in the two lenses.
const shutter = (index: number, pixel: readonly [number, number]): Quaternion =>
  fromRotationVector([0, (index === 0 ? 1 : -1) * pixel[1] * 0.004, 0]);

describe('the WebGPU stitcher', () => {
  it('matches the reference stitch', async () => {
    const difference = compare(await stitchOnGpu(baseFrame), reference(baseFrame));
    expect(difference.largest).toBeLessThanOrEqual(3);
    expect(difference.mean).toBeLessThan(0.6);
  });

  it('applies each lens gain', async () => {
    const frame: StitchFrame = {
      ...baseFrame,
      correction: identity(),
      gains: [
        [1.2, 0.9, 1],
        [0.8, 1.1, 0.7],
      ],
    };
    const difference = compare(await stitchOnGpu(frame), reference(frame));
    expect(difference.largest).toBeLessThanOrEqual(3);
  });

  it('undoes the vignetting the way the reference does', async () => {
    const frame: StitchFrame = { ...baseFrame, vignetting: { strength: 0.4, start: 0.6 } };
    const difference = compare(await stitchOnGpu(frame), reference(frame));
    expect(difference.largest).toBeLessThanOrEqual(3);
  });

  it('corrects rolling shutter from the tabulated turn', async () => {
    const frame: StitchFrame = {
      ...baseFrame,
      shutter: { sample: shutter, rows: SIZE, steps: 33 },
    };
    const difference = compare(await stitchOnGpu(frame), reference(frame));
    expect(difference.largest).toBeLessThanOrEqual(4);
    expect(difference.mean).toBeLessThan(0.6);
  });
});
