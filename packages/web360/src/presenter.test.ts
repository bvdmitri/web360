import { create, globals } from 'webgpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readbackPresenter } from './presenter';

Object.assign(globalThis, globals);

// Kept for the whole run: the native bindings must outlive their adapter.
const gpu = create([]);
const opened: GPUDevice[] = [];
const device = (): GPUDevice => opened[0]!;

beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (adapter === null) throw new Error('no WebGPU adapter: the presenter tests need one');
  opened.push(await adapter.requestDevice());
});

afterAll(() => {
  device().destroy();
});

const paint = (texture: GPUTexture, colour: GPUColor): void => {
  const encoder = device().createCommandEncoder();
  encoder
    .beginRenderPass({
      colorAttachments: [
        { view: texture.createView(), loadOp: 'clear', clearValue: colour, storeOp: 'store' },
      ],
    })
    .end();
  device().queue.submit([encoder.finish()]);
};

interface Made {
  readonly data: Uint8Array;
  readonly init: VideoFrameBufferInit;
}

describe('the readback presenter', () => {
  it('reads each rendered frame back as padded RGBA rows with its timing', async () => {
    const made: Made[] = [];
    const presenter = readbackPresenter(device(), { width: 10, height: 2 }, (data, init) => {
      made.push({ data, init });
      return {} as VideoFrame;
    });
    expect(presenter.format).toBe('rgba8unorm');
    paint(presenter.target(), { r: 1, g: 0, b: 0, a: 1 });
    await presenter.capture({ timestamp: 7, duration: 3 });
    paint(presenter.target(), { r: 0, g: 0, b: 1, a: 1 });
    await presenter.capture({ timestamp: 10, duration: 3 });
    presenter.destroy();

    expect(made[0]?.init).toEqual({
      format: 'RGBA',
      codedWidth: 10,
      codedHeight: 2,
      layout: [{ offset: 0, stride: 256 }],
      timestamp: 7,
      duration: 3,
    });
    expect([...(made[0]?.data.subarray(0, 4) ?? [])]).toEqual([255, 0, 0, 255]);
    expect([...(made[1]?.data.subarray(256 + 36, 256 + 40) ?? [])]).toEqual([0, 0, 255, 255]);
    expect(made[1]?.data.length).toBe(512);
  });
});
