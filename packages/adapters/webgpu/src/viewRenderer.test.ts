import {
  degrees,
  packView,
  renderView,
  type Rgb,
  type TextureSampler,
  type View,
} from '@web360/core';
import { create, globals } from 'webgpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createViewRenderer } from './viewRenderer';

Object.assign(globalThis, globals);

// The GPU object is kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);
// Opened in a hook: requesting the adapter while the module loads crashes the native bindings.
const opened: GPUDevice[] = [];
const device = (): GPUDevice => opened[0]!;
beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error('no WebGPU adapter: the view renderer tests need one');
  opened.push(await adapter.requestDevice());
});

afterAll(() => {
  device().destroy();
});

const SOURCE = { width: 96, height: 48 };
const OUTPUT = { width: 64, height: 36 };
const BYTE = 255;

// A picture smooth across its left and right edges, so the wrapped seam is smooth too.
const texels = (): Uint8Array<ArrayBuffer> => {
  const data = new Uint8Array(SOURCE.width * SOURCE.height * 4);
  for (let y = 0; y < SOURCE.height; y += 1) {
    for (let x = 0; x < SOURCE.width; x += 1) {
      const at = (y * SOURCE.width + x) * 4;
      const turn = (2 * Math.PI * x) / SOURCE.width;
      data[at] = Math.round(128 + 100 * Math.cos(turn));
      data[at + 1] = Math.round((y / (SOURCE.height - 1)) * 220);
      data[at + 2] = Math.round(128 + 100 * Math.sin(2 * turn + y / 7));
      data[at + 3] = BYTE;
    }
  }
  return data;
};

const texel = (data: Uint8Array, x: number, y: number): Rgb => {
  const cx = ((x % SOURCE.width) + SOURCE.width) % SOURCE.width;
  const cy = Math.min(SOURCE.height - 1, Math.max(0, y));
  const at = (cy * SOURCE.width + cx) * 4;
  return [(data[at] ?? 0) / BYTE, (data[at + 1] ?? 0) / BYTE, (data[at + 2] ?? 0) / BYTE];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Linear filtering as the GPU's view sampler does it: repeating across, clamped down.
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
    size: [SOURCE.width, SOURCE.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device().queue.writeTexture({ texture }, data, { bytesPerRow: SOURCE.width * 4 }, [
    SOURCE.width,
    SOURCE.height,
  ]);
  return texture;
};

const readBack = async (texture: GPUTexture): Promise<Uint8Array> => {
  const stride = Math.ceil((OUTPUT.width * 4) / 256) * 256;
  const buffer = device().createBuffer({
    size: stride * OUTPUT.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device().createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: stride }, [
    OUTPUT.width,
    OUTPUT.height,
  ]);
  device().queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(buffer.getMappedRange());
  const bytes = new Uint8Array(OUTPUT.width * OUTPUT.height * 4);
  for (let row = 0; row < OUTPUT.height; row += 1) {
    bytes.set(
      padded.subarray(row * stride, row * stride + OUTPUT.width * 4),
      row * OUTPUT.width * 4,
    );
  }
  buffer.unmap();
  buffer.destroy();
  return bytes;
};

const renderOnGpu = async (views: readonly View[]): Promise<Uint8Array> => {
  const texture = upload(texels());
  const output = device().createTexture({
    size: [OUTPUT.width, OUTPUT.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const renderer = createViewRenderer(device(), 'rgba8unorm');
  for (const view of views) renderer.render({ packed: packView(view, OUTPUT), texture }, output);
  const bytes = await readBack(output);
  renderer.destroy();
  texture.destroy();
  output.destroy();
  return bytes;
};

const reference = (view: View): Rgb[] =>
  renderView({ view, sampler: bilinear(texels()), source: SOURCE, ...OUTPUT });

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

const view = (parts: Partial<Record<keyof View, number>>): View => ({
  pan: degrees(parts.pan ?? 0),
  tilt: degrees(parts.tilt ?? 0),
  roll: degrees(parts.roll ?? 0),
  fov: degrees(parts.fov ?? 90),
  distance: parts.distance ?? 0,
});

// Bilinear filtering on the GPU rounds its weights to a few bits, so a pixel may differ by a few
// levels; a wrong direction would differ by tens.
const TOLERANCE = 4;

describe('the WebGPU view renderer', () => {
  it('matches the reference view with a flat lens, panned across the seam', async () => {
    const across = view({ pan: 175, tilt: 10, fov: 80 });
    expect(largestDifference(await renderOnGpu([across]), reference(across))).toBeLessThanOrEqual(
      TOLERANCE,
    );
  });

  it('matches it rolled and stepped back', async () => {
    const back = view({ pan: -40, tilt: -20, roll: 15, fov: 120, distance: 0.6 });
    expect(largestDifference(await renderOnGpu([back]), reference(back))).toBeLessThanOrEqual(
      TOLERANCE,
    );
  });

  it('matches a tiny planet, after another view on the same buffer', async () => {
    const tiny = view({ tilt: -90, fov: 150, distance: 1 });
    const bytes = await renderOnGpu([view({ pan: 30 }), tiny]);
    expect(largestDifference(bytes, reference(tiny))).toBeLessThanOrEqual(TOLERANCE);
  });
});
