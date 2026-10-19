# ADR 0015: The rendition API

Status: accepted (2026-10-19)

## Context

An application that takes 360 uploads (the first is a club video site) wants one call: give it the
files the user picked and the span and stabilization wanted, and get stitched frames to encode.
Encoding, muxing audio and storing the result stay the application's: it already has an encoder
and knows where the output goes. The decode, stitch and present steps run in a browser (a
dedicated worker, usually), on WebCodecs and WebGPU.

## Decision

- **`packages/web360` is the published package** (`web360` on npm). Its entry is
  `openRendition(source, options)`: `source` is the recording's files as `Blob`s (`main`, the file
  with the trailer, and `second` for a split recording); `options` are the output `width` (the height
  is half), `from` and `to` in seconds, `stabilization` (`off`, `lock`, `horizon`, `smooth`, by
  default `smooth`), `smoothing`, `gainMatching` (default on) and an `AbortSignal`.
- **A `Rendition`** has `metadata` (the recording's `duration` in seconds and camera `model`), the
  span's `duration`, `frames()` (an async iterator of `VideoFrame`s timed in microseconds from the
  span's start, each closed by the caller) and `dispose()`. Opening reads only headers and checks
  the browser; decoding and stitching wait for `frames()`.
- **Failures are a `Web360Error` with a `code`**: `missing-second-file`, `unreadable-recording`,
  `render-unavailable` (no WebGPU), `webcodecs-unavailable`, `codec-unsupported`, `decode`. An
  application maps the codes to what it tells its user.
- **The browser is a `Platform`**: WebCodecs decoders and chunks, a WebGPU device, an
  `OffscreenCanvas` presenter, the copy of a decoded frame to a texture and to a small picture.
  `browserPlatform()` is the default; a test passes its own, so the whole loop (decode pairing,
  colour matching, stitching on a real GPU through Dawn, cleanup on error, abort and early return)
  is tested outside a browser with fake decoders.
- **Colour matching is estimated every thirtieth frame** on 256-pixel copies of the lens frames and
  blended into the running correction (gains geometrically, vignetting linearly, three tenths of
  the way each time), so exposure follows the scene without flicker.

## Consequences

- The application keeps its encoder and storage; web360 holds no player, clock or audio.
- The browser path itself (real `VideoDecoder`, `copyExternalImageToTexture`, the canvas capture) is
  exercised only in a browser; the first consumer's end-to-end tests and its real uploads are where
  it is proven.
- The output frames are the canvas's preferred format (often BGRA); encoders take either order.
