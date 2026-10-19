import { STITCH_SHADER } from './shader';

const VERTICES = 3;

/** One frame for the {@link Stitcher}: the packed stitch and the lens images it refers to. */
export interface StitcherFrame {
  readonly packed: Float32Array<ArrayBuffer>;
  readonly textures: readonly GPUTexture[];
}

/** Renders stitched frames on one GPU device. */
export interface Stitcher {
  /** Stitches `frame` into `target`, which must be a render attachment of the stitcher's format. */
  render(frame: StitcherFrame, target: GPUTexture): void;
  /** Releases the GPU resources the stitcher holds. */
  destroy(): void;
}

interface Resources {
  readonly device: GPUDevice;
  readonly pipeline: GPURenderPipeline;
  readonly sampler: GPUSampler;
  readonly packed: { buffer: GPUBuffer | undefined };
}

/**
 * Creates a stitcher that renders the core's packed stitch (`packStitch`) on `device` into textures
 * of `format`.
 *
 * @remarks The lens images are sampled textures, one or two: `LensImage.texture` in the packed
 * frame names which. A camera with both lenses in one image passes that texture once. Decoded video
 * frames are copied into such textures by the caller (for a `VideoFrame`,
 * `copyExternalImageToTexture`), so the shader has one path to test. Each `render` submits its own
 * work; the packed buffer is reused while it fits.
 */
export function createStitcher(device: GPUDevice, format: GPUTextureFormat): Stitcher {
  const module = device.createShaderModule({ code: STITCH_SHADER });
  const resources: Resources = {
    device,
    pipeline: device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    }),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
    packed: { buffer: undefined },
  };
  return {
    render: (frame, target): void => {
      draw(resources, { bindGroup: bindFrame(resources, frame), target });
    },
    destroy: (): void => {
      resources.packed.buffer?.destroy();
    },
  };
}

function bindFrame(resources: Resources, frame: StitcherFrame): GPUBindGroup {
  const [first, second = first] = frame.textures;
  if (first === undefined || second === undefined) throw new Error('no lens image to stitch');
  return resources.device.createBindGroup({
    layout: resources.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: upload(resources, frame.packed) } },
      { binding: 1, resource: resources.sampler },
      { binding: 2, resource: first.createView() },
      { binding: 3, resource: second.createView() },
    ],
  });
}

function upload(resources: Resources, packed: Float32Array<ArrayBuffer>): GPUBuffer {
  const current = resources.packed.buffer;
  const buffer =
    current !== undefined && current.size >= packed.byteLength
      ? current
      : resources.device.createBuffer({
          size: packed.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
  if (buffer !== current) {
    current?.destroy();
    resources.packed.buffer = buffer;
  }
  resources.device.queue.writeBuffer(buffer, 0, packed);
  return buffer;
}

function draw(
  resources: Resources,
  pass: { readonly bindGroup: GPUBindGroup; readonly target: GPUTexture },
): void {
  const encoder = resources.device.createCommandEncoder();
  const render = encoder.beginRenderPass({
    colorAttachments: [{ view: pass.target.createView(), loadOp: 'clear', storeOp: 'store' }],
  });
  render.setPipeline(resources.pipeline);
  render.setBindGroup(0, pass.bindGroup);
  render.draw(VERTICES);
  render.end();
  resources.device.queue.submit([encoder.finish()]);
}
