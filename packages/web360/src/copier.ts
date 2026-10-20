const VERTICES = 3;
const RGBA_BYTES = 4;
const PROBE_SIZE = 64;

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

/** Copies a decoded video frame onto a texture on the GPU, done once a returned promise settles. */
export type FrameCopier = (frame: VideoFrame, texture: GPUTexture) => void | Promise<void>;

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

/**
 * A {@link FrameCopier} that reads each frame's pixels on the CPU, as RGBA, and writes them onto
 * the target.
 *
 * @remarks For a browser that cannot hand a decoded frame to WebGPU at all: headless Linux
 * Chromium on SwiftShader has no shared image for it, so importing a frame, or copying one with
 * `copyExternalImageToTexture`, loses the device. The frame is written unscaled from the target's
 * corner, clipped to it; a rendition's textures are made the size of their video, so it fills them.
 * It costs a copy through memory per frame, so {@link canImportFrames} decides when it is needed.
 */
export function cpuFrameCopier(device: GPUDevice): FrameCopier {
  return async (frame, texture) => {
    const width = frame.visibleRect?.width ?? frame.codedWidth;
    const height = frame.visibleRect?.height ?? frame.codedHeight;
    const pixels = new Uint8Array(width * height * RGBA_BYTES);
    await frame.copyTo(pixels, { format: 'RGBA' });
    device.queue.writeTexture({ texture }, pixels, { bytesPerRow: width * RGBA_BYTES }, [
      Math.min(width, texture.width),
      Math.min(height, texture.height),
    ]);
  };
}

/**
 * Whether this browser can import a video frame into WebGPU, tried once on a spare device.
 *
 * @remarks A frame drawn on a small canvas is imported and drawn as {@link externalFrameCopier}
 * does; where the browser cannot share the frame with WebGPU, the work never completes and the
 * device is lost, so the answer is no. The spare device needs its own adapter (an adapter makes
 * one device) and is destroyed after. A browser without `OffscreenCanvas` or `VideoFrame` to make
 * the frame with is taken at its word.
 */
export async function canImportFrames(gpu: GPU): Promise<boolean> {
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoFrame === 'undefined') return true;
  const adapter = await gpu.requestAdapter();
  const device = await adapter?.requestDevice();
  if (device === undefined) return true;
  const canvas = new OffscreenCanvas(PROBE_SIZE, PROBE_SIZE);
  canvas.getContext('2d')?.fillRect(0, 0, PROBE_SIZE, PROBE_SIZE);
  const frame = new VideoFrame(canvas, { timestamp: 0 });
  try {
    const texture = device.createTexture({
      size: [PROBE_SIZE, PROBE_SIZE],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    await externalFrameCopier(device)(frame, texture);
    await device.queue.onSubmittedWorkDone();
    return true;
  } catch {
    return false;
  } finally {
    frame.close();
    device.destroy();
  }
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
