# ADR 0014: A rendition is planned in the core

Status: accepted (2026-10-19)

## Context

A rendition turns a span of a recording into stitched, stabilized frames for an encoder. Most of
that is decisions, not I/O: which frames to show, which to decode first, how the lens files pair up,
where the view points at each frame, and how the lens colours are corrected. Only decoding,
copying pictures and rendering touch the browser. Keeping the decisions in the pure core keeps them
tested to the core's standard and the browser layer thin.

## Decision

- **`rendition/planSpan`** chooses the frames: the first video's frames inside the window, in
  presentation order, each paired with the nearest-in-time frame of every other video, and for each
  video the decode-order range to feed a decoder, from the last sync frame before the first frame
  it needs.
- **`rendition/viewOf`** gives the stabilized view along the attitude: `off` follows the camera,
  `lock`, `horizon`, `smooth` and `follow` compose ADR 0006's corrections onto it (`smooth` and
  `follow` with a one-second time constant unless told otherwise).
- **`rendition/frameAt`** gives one frame's `StitchFrame`: the frame's moment on the motion clock
  is the capture clock plus its media time (ADR 0010), the output turns by `outputToCamera` at that
  moment, the rolling-shutter turn is tabulated down the canvas rows (ADR 0011), and the output is
  twice as wide as tall with an even height.
- **`rendition/cubeFrameAt`** gives a cube-map frame (ADR 0020) the same way, timed and turned as
  `frameAt`, with no rolling-shutter table and no colour correction: the camera stitched and matched
  its own lenses.
- **`stitch/estimateColour`** returns a `ColourCorrection`: each lens's gains (ADR 0008) and the
  seam colour field (ADR 0018), measured after each lens is flattened by its own vignetting (ADR
  0017). It reads a small RGBA copy of each video's frame (`LensPicture`) through each lens's image
  placement, so the browser layer only has to copy a frame to a few hundred pixels.

## Consequences

- The browser layer (decode, copy, render) holds no decision a test of the core could not reach.
- Pairing by nearest time copes with lens files whose frames are offset slightly; files that
  dropped frames pair with the nearest remaining one rather than drifting.
- Colour is estimated on frames the rendition samples, not every frame; how often, and how the
  estimate is smoothed between samples, is the browser layer's choice and a quality knob.
