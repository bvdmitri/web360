# ADR 0015: The rendition API

Status: accepted (2026-10-19)

## Context

An application that takes 360 uploads wants one call: give it the files the user picked and the
span and stabilization wanted, and get stitched frames to encode. Encoding, muxing audio and
storing the result stay the application's: it already has an encoder and knows where the output
goes. The decode, stitch and present steps run in a browser (a dedicated worker, usually), on
WebCodecs and WebGPU.

## Decision

- **`packages/web360` is the published package** (`@bvdmitri/web360` on npm, the unscoped name
  being refused as too close to another package's). Its entry is `openRendition(source, options)`.
  `source` is a `RenditionSource`, the recording's files as `Blob`s: `main` (an Insta360's file
  with the trailer, or a GoPro's first chapter), `second` (a split Insta360 recording's other lens
  file) and `following` (a GoPro's later chapters, in order). `options` are the output `width` (the
  height is half), `from` and `to` in seconds, `stabilization` (`off`, `lock`, `horizon`, `smooth`,
  `follow`, by default `smooth`), `smoothing`, `gainMatching` (default on) and an `AbortSignal`.
- **A `Rendition`** has `metadata` (the recording's `duration` in seconds and camera `model`), the
  span's `duration`, `frames()` (an async iterator of `VideoFrame`s timed in microseconds from the
  span's start, each closed by the caller) and `dispose()`. Opening reads only headers and checks
  the browser; decoding and stitching wait for `frames()`.
- **Failures are a `Web360Error` with a `code`**: `missing-second-file`, `unreadable-recording`,
  `render-unavailable` (no WebGPU), `webcodecs-unavailable`, `codec-unsupported`, `decode`. An
  application maps the codes to what it tells its user.
- **The browser is a `Platform`**: WebCodecs decoders and chunks, a WebGPU device, a presenter, and
  two ways to move a decoded frame: onto a texture (`upload`: imported with `importExternalTexture`
  and drawn, or copied on the CPU where the browser cannot import, as ADR 0022 decides) and into a
  small picture for colour (`picture`). The presenter (`readbackPresenter`) renders into a
  texture of its own and reads each frame back as RGBA rows for a `VideoFrame`: a worker's WebGPU
  canvas is never presented, and frames taken from one read blank in headless
  Chromium. `browserPlatform()` is the default; a test passes its own, so the whole loop (decode
  pairing, colour matching, stitching on a real GPU through Dawn, cleanup on error, abort and early
  return) is tested outside a browser with fake decoders.
- **Colour matching is estimated every thirtieth frame** on 256-pixel copies of the lens frames and
  blended into the running correction three tenths of the way each time (`blendColour`): the gains
  geometrically, the seam field's offsets linearly. Exposure follows the scene without flicker.
- **A cube-map recording renders without colour work** (ADR 0020): its frames go to the cube
  renderer, and `gainMatching` has no effect on it.

## Consequences

- The application keeps its encoder and storage; web360 holds no player, clock or audio.
- The browser path itself (real `VideoDecoder`, `importExternalTexture`, the CPU copier, the
  read-back presenter) is exercised only in a browser; a consumer's end-to-end tests are where it
  is proven.
- Output frames are RGBA. Reading them back costs a copy from the GPU per frame; on the ONE R at
  3840 by 1920 a Mac renders about 20 frames a second this way. Presenting without the copy is an
  optimisation left open.
- Where a browser cannot import a decoded frame (headless Linux Chromium on SwiftShader), the CPU
  copier takes its place (ADR 0022).
