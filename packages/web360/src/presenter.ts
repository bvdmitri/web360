/** Where stitched frames are drawn and how each becomes a frame for the caller. */
export interface Presenter {
  readonly format: GPUTextureFormat;
  /** The texture the next frame is rendered into. */
  target(): GPUTexture;
  /** The frame just rendered, at the given time, as the caller receives it. */
  capture(timing: { readonly timestamp: number; readonly duration: number }): Promise<VideoFrame>;
  destroy(): void;
}

const ROW_ALIGNMENT = 256;
const BYTES_PER_PIXEL = 4;

/** Makes a frame from RGBA bytes: the browser's `VideoFrame` constructor, or a test double. */
export type FrameMaker = (data: Uint8Array<ArrayBuffer>, init: VideoFrameBufferInit) => VideoFrame;

const browserFrame: FrameMaker = (data, init) => new VideoFrame(data, init);

/**
 * A {@link Presenter} that renders into a texture of its own and reads each frame back as RGBA
 * bytes for a `VideoFrame`.
 *
 * @remarks A canvas would avoid the copy, but a worker's WebGPU canvas is never presented: a
 * frame made from it read blank in headless Chromium, and one made from its transferred bitmap
 * failed. Reading the texture back behaves the same in every browser. Rows are padded to the 256 bytes a copy needs, and the frame's layout says so. The
 * staging buffer is reused from frame to frame.
 */
export function readbackPresenter(
  device: GPUDevice,
  size: { readonly width: number; readonly height: number },
  makeFrame: FrameMaker = browserFrame,
): Presenter {
  const readback = openReadback(device, size);
  const { stride } = readback;
  return {
    format: 'rgba8unorm',
    target: () => readback.texture,
    capture: async (timing): Promise<VideoFrame> =>
      makeFrame(await readBack(readback), {
        format: 'RGBA',
        codedWidth: size.width,
        codedHeight: size.height,
        layout: [{ offset: 0, stride }],
        ...timing,
      }),
    destroy: (): void => {
      readback.staging.destroy();
      readback.texture.destroy();
    },
  };
}

function openReadback(
  device: GPUDevice,
  size: { readonly width: number; readonly height: number },
): Readback {
  const stride = Math.ceil((size.width * BYTES_PER_PIXEL) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
  return {
    device,
    size,
    stride,
    texture: device.createTexture({
      size: [size.width, size.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    }),
    staging: device.createBuffer({
      size: stride * size.height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    }),
  };
}

interface Readback {
  readonly device: GPUDevice;
  readonly size: { readonly width: number; readonly height: number };
  readonly stride: number;
  readonly texture: GPUTexture;
  readonly staging: GPUBuffer;
}

async function readBack(readback: Readback): Promise<Uint8Array<ArrayBuffer>> {
  const { device, staging, size } = readback;
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture: readback.texture },
    { buffer: staging, bytesPerRow: readback.stride },
    [size.width, size.height],
  );
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const data = Uint8Array.from(new Uint8Array(staging.getMappedRange()));
  staging.unmap();
  return data;
}
