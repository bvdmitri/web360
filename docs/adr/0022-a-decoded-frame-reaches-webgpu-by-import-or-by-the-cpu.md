# ADR 0022: A decoded frame reaches WebGPU by import, or by the CPU where it cannot

Status: accepted (2026-10-20)

## Context

ADR 0012 has a decoded `VideoFrame` reach a sampled texture on the GPU. In a browser that is
`importExternalTexture`, drawn onto the texture (`externalFrameCopier`): no copy through memory,
the decoder's own planes converted to RGB on the GPU. `copyExternalImageToTexture` from a decoded
frame lost the device in headless macOS Chromium, where importing did not.

Headless Linux Chromium on SwiftShader (the first consumer's CI) can do neither. Its GPU process
has no shared image to hand a video frame to WebGPU ("Could not find SharedImageBackingFactory ...
WebgpuRead|WebgpuWrite"), so importing a frame, or copying one, loses the device, and the next
read back fails with "A valid external Instance reference no longer exists". This holds for a frame
drawn on a canvas as much as for a decoded one, and losing the device loses every adapter fetched
before it. `VideoFrame.copyTo` as RGBA, then `writeTexture`, works there.

## Decision

- **The platform finds out once per page** (`canImportFrames`): before it fetches the adapter it
  renders on, it imports a 64-pixel canvas frame on a spare adapter and device and waits for that
  work. A browser where the work fails gets the CPU copier on its devices; every other browser keeps
  the import.
- **The CPU copier** (`cpuFrameCopier`) reads each frame as RGBA with `copyTo` and writes it onto the
  texture with `writeTexture`, unscaled and clipped to the texture, which a rendition makes the size
  of its video.
- `Platform.upload` may return a promise, which the frame loop awaits, since `copyTo` is
  asynchronous.

## Consequences

- Headless Linux Chromium stitches: the same frames as the import path (the mean brightness of a
  frame of the X5 fixture is 55.4 of 255 there against 55.6 by import on macOS).
- A browser on the CPU path copies each frame through memory, slower at 8K but only where nothing
  faster works.
- The check costs one spare device and a small draw per page, and it runs only in a browser; the
  copier choice is tested with stand-in devices.
