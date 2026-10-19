# ADR 0012: The stitch renders on WebGPU

Status: accepted (2026-10-19)

## Context

The reference stitch (`stitch/renderEquirectangular`, ADR 0008) runs on the CPU, one output pixel
at a time, which suits a preview but not full-resolution video: a 5.7K frame is 16 million
directions, each projected through two lenses twice (ADR 0011). A browser stitcher needs the GPU.
Two browser GPU APIs exist. WebGL2 is everywhere; WebGPU is in current Chrome, Edge and Safari and
gives compute shaders and storage buffers, which the later seam work (multiband blending, an
optical-flow seam) needs. A browser that stitches 360 already needs WebCodecs, so asking for
WebGPU narrows support only a little.

## Decision

- **The renderer is a WGSL render pass in `packages/adapters/webgpu`**: a full-screen triangle
  whose fragments are the output pixels, applying the reference stitch to the numbers the core
  packs. No 3D library.
- **The core owns the contract.** `stitch/packStitch` reduces a frame (lens optics and image
  placement, the stabilization correction, gains, vignetting, and the rolling-shutter turn
  tabulated down the rows) to four-float slots laid out as `STITCH_LAYOUT` states. The shader reads
  only those numbers, so its maths is the core's, and `optics/lensPose` is shared so both project
  the same way.
- **Lens images are ordinary sampled textures**, one per lens or one shared, sampled linearly with
  calibration-canvas pixels at texel centres. A decoded `VideoFrame` reaches one by
  `copyExternalImageToTexture`. External textures would skip that copy but cannot be exercised
  outside a browser; one texture path keeps the shader testable.
- **The shader is tested against the reference on a real GPU**: the adapter's tests render
  synthetic lens images through Dawn's Node bindings (`webgpu`, a dev dependency) and compare every
  output pixel to `renderEquirectangular` with a bilinear sampler, for the plain stitch, gains,
  vignetting and rolling shutter. CI runs them on Mesa's software Vulkan driver.

## Consequences

- The stitch needs WebGPU; a browser without it cannot stitch, and the consuming application blocks
  the upload rather than falling back.
- The shader works in single precision, so it takes the angle from the optical axis as `atan2` of
  its sine and cosine (`acos` would lose accuracy near the lens centre). Its output agrees with the
  reference to within 3 of 255 levels.
- Between tabulated rows the rolling-shutter turn is interpolated; the turn varies smoothly over a
  readout, so a few dozen steps match the exact correction.
- A change to the packed layout changes `packStitch`, `STITCH_LAYOUT` and the shader together; the
  GPU tests catch a mismatch.
