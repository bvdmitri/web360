const VERTICES = 3;

const COPY_SHADER = /* wgsl */ `
@group(0) @binding(0) var frame: texture_external;
@group(0) @binding(1) var frameSampler: sampler;

struct Corner {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> Corner {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return Corner(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), vec2f(corner.x, 1.0 - corner.y));
}

@fragment
fn fragmentMain(corner: Corner) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(frame, frameSampler, corner.uv);
}
`;

/** Copies a decoded video frame onto a texture on the GPU. */
export type FrameCopier = (frame: VideoFrame, texture: GPUTexture) => void;

/**
 * A {@link FrameCopier} that imports each frame as an external texture and draws it onto the
 * target, scaled to fill it.
 *
 * @remarks Importing is the path browsers make cheap for video (no CPU copy, the decoder's own
 * planes sampled and converted to RGB on the GPU); `copyExternalImageToTexture` from a decoded
 * frame lost the device in headless Chromium where this path did not. The pipeline is made once per
 * target format; the external texture lives only for the pass that draws it.
 */
export function externalFrameCopier(device: GPUDevice): FrameCopier {
  const copying: Copying = {
    device,
    module: device.createShaderModule({ code: COPY_SHADER }),
    pipelines: new Map(),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
  };
  return (frame, texture) => {
    const pipeline = pipelineFor(copying, texture.format);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: device.importExternalTexture({ source: frame }) },
        { binding: 1, resource: copying.sampler },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(VERTICES);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };
}

interface Copying {
  readonly device: GPUDevice;
  readonly module: GPUShaderModule;
  readonly pipelines: Map<GPUTextureFormat, GPURenderPipeline>;
  readonly sampler: GPUSampler;
}

function pipelineFor(copying: Copying, format: GPUTextureFormat): GPURenderPipeline {
  const known = copying.pipelines.get(format);
  if (known !== undefined) return known;
  const { module } = copying;
  const made = copying.device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertexMain' },
    fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
  });
  copying.pipelines.set(format, made);
  return made;
}
