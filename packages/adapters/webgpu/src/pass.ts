const VERTICES = 3;

/** One frame for a {@link Pass}: the packed numbers and the textures they refer to. */
export interface PassFrame {
  readonly packed: Float32Array<ArrayBuffer>;
  readonly textures: readonly GPUTexture[];
}

/** A full-screen render pass of one shader on one GPU device. */
export interface Pass {
  /** Renders `frame` into `target`, which must be a render attachment of the pass's format. */
  render(frame: PassFrame, target: GPUTexture): void;
  /** Releases the GPU resources the pass holds. */
  destroy(): void;
}

interface Resources {
  readonly device: GPUDevice;
  readonly pipeline: GPURenderPipeline;
  readonly sampler: GPUSampler;
  readonly packed: { buffer: GPUBuffer | undefined };
  readonly missing: string;
}

/**
 * Creates a full-screen pass of a shader that reads a packed storage buffer, a linear sampler and
 * up to two textures (bindings 0 to 3), into textures of `format`.
 *
 * @remarks The shape the stitch and the cube-map render share: a full-screen triangle whose
 * fragments are the output pixels. A frame with one texture binds it to both texture slots. Each
 * `render` submits its own work; the packed buffer is reused while it fits. `missing` is the error
 * message for a frame without a texture.
 */
export function createPass(
  device: GPUDevice,
  shader: { readonly code: string; readonly format: GPUTextureFormat; readonly missing: string },
): Pass {
  const module = device.createShaderModule({ code: shader.code });
  const resources: Resources = {
    device,
    pipeline: device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: shader.format }] },
      primitive: { topology: 'triangle-list' },
    }),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
    packed: { buffer: undefined },
    missing: shader.missing,
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

function bindFrame(resources: Resources, frame: PassFrame): GPUBindGroup {
  const [first, second = first] = frame.textures;
  if (first === undefined || second === undefined) throw new Error(resources.missing);
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
