import {
  fromRotationVector,
  goproCubeMap,
  identity,
  packCube,
  renderCubeMap,
  type CubeFrame,
  type Rgb,
  type TextureSampler,
} from '@web360/core';
import { create, globals } from 'webgpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCubeRenderer } from './cubeRenderer';

Object.assign(globalThis, globals);

// The GPU object is kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);
// Opened in a hook: requesting the adapter while the module loads crashes the native bindings.
const opened: GPUDevice[] = [];
const device = (): GPUDevice => opened[0]!;
beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error('no WebGPU adapter: the cube renderer tests need one');
  opened.push(await adapter.requestDevice());
});

afterAll(() => {
  device().destroy();
});

// A GoPro-shaped cube at a small size: faces of 32 pixels, seam bands of 4.
const FACE = 32;
const BAND = 4;
const TRACK = { width: 3 * FACE + 2 * BAND, height: FACE };
const OUTPUT: readonly [number, number] = [128, 64];
const BYTE = 255;

// The MAX2 layout (FORMAT-gopro.md), scaled down.
const cube = goproCubeMap(TRACK);

// A smooth, distinct picture per texture, so bilinear sampling differences stay small.
const texels = (index: number): Uint8Array<ArrayBuffer> => {
  const data = new Uint8Array(TRACK.width * TRACK.height * 4);
  for (let y = 0; y < TRACK.height; y += 1) {
    for (let x = 0; x < TRACK.width; x += 1) {
      const at = (y * TRACK.width + x) * 4;
      data[at] = Math.round((x / (TRACK.width - 1)) * 200) + index * 40;
      data[at + 1] = Math.round((y / (TRACK.height - 1)) * 220);
      data[at + 2] = Math.round(128 + 100 * Math.sin((x + y) / 9 + index));
      data[at + 3] = BYTE;
    }
  }
  return data;
};

const texel = (data: Uint8Array, x: number, y: number): Rgb => {
  const cx = Math.min(TRACK.width - 1, Math.max(0, x));
  const cy = Math.min(TRACK.height - 1, Math.max(0, y));
  const at = (cy * TRACK.width + cx) * 4;
  return [(data[at] ?? 0) / BYTE, (data[at + 1] ?? 0) / BYTE, (data[at + 2] ?? 0) / BYTE];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Linear filtering as the GPU does it: a texel's centre at +0.5, clamped at the edge.
const bilinear =
  (data: Uint8Array): TextureSampler =>
  (pixel) => {
    const x = pixel[0] - 0.5;
    const y = pixel[1] - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const top = mix(texel(data, x0, y0), texel(data, x0 + 1, y0), x - x0);
    const bottom = mix(texel(data, x0, y0 + 1), texel(data, x0 + 1, y0 + 1), x - x0);
    return mix(top, bottom, y - y0);
  };

const upload = (data: Uint8Array<ArrayBuffer>): GPUTexture => {
  const texture = device().createTexture({
    size: [TRACK.width, TRACK.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device().queue.writeTexture({ texture }, data, { bytesPerRow: TRACK.width * 4 }, [
    TRACK.width,
    TRACK.height,
  ]);
  return texture;
};

const target = (): GPUTexture =>
  device().createTexture({
    size: [...OUTPUT],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

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

const renderOnGpu = async (frames: readonly CubeFrame[]): Promise<Uint8Array> => {
  const textures = [upload(texels(0)), upload(texels(1))];
  const output = target();
  const renderer = createCubeRenderer(device(), 'rgba8unorm');
  for (const frame of frames) renderer.render({ packed: packCube(frame), textures }, output);
  const bytes = await readBack(output);
  renderer.destroy();
  for (const texture of [...textures, output]) texture.destroy();
  return bytes;
};

const reference = (frame: CubeFrame): Rgb[] =>
  renderCubeMap({ ...frame, samplers: [bilinear(texels(0)), bilinear(texels(1))] });

const largestDifference = (gpu: Uint8Array, cpu: readonly Rgb[]): number => {
  let largest = 0;
  for (const [index, colour] of cpu.entries()) {
    for (let channel = 0; channel < 3; channel += 1) {
      const expected = Math.min(1, colour[channel] ?? 0) * BYTE;
      largest = Math.max(largest, Math.abs((gpu[index * 4 + channel] ?? 0) - expected));
    }
  }
  return largest;
};

const frame = (correction = fromRotationVector([0.2, -0.1, 0.4])): CubeFrame => ({
  cube,
  correction,
  width: OUTPUT[0],
  height: OUTPUT[1],
});

describe('the WebGPU cube renderer', () => {
  it('matches the reference cube render, seam bands included', async () => {
    const turned = frame();
    expect(largestDifference(await renderOnGpu([turned]), reference(turned))).toBeLessThanOrEqual(
      3,
    );
  });

  it('matches it unturned, and frame after frame on the same buffer', async () => {
    const level = frame(identity());
    const bytes = await renderOnGpu([frame(), level]);
    expect(largestDifference(bytes, reference(level))).toBeLessThanOrEqual(3);
  });

  it('refuses a frame without a texture', () => {
    const renderer = createCubeRenderer(device(), 'rgba8unorm');
    const output = target();
    expect(() => {
      renderer.render({ packed: packCube(frame()), textures: [] }, output);
    }).toThrow(/texture/);
    renderer.destroy();
    output.destroy();
  });
});
