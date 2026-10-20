# ADR 0011: Rolling-shutter correction

Status: accepted (2026-10-19), the readout order supported by modest evidence on the ONE R

## Context

The ONE R reads each lens's sensor out row by row over 22 ms (`CameraRecording.rollingShutter`). In
a fast turn the camera moves by a degree or more between the first and last row, so stitching every
row with the frame's single attitude wobbles the scene. The recording states the readout duration,
but not which way the rows run or which row its frame timestamp marks.

## Decision

- **The stitch takes a `Shutter`: per lens and pixel, the turn the camera made between the frame's
  moment and the moment that pixel's row was read.** `stitchSample` projects each lens once at the
  frame's moment to find the row, then again through that row's turn. The compositor, and the seam
  probe, take it as an option.
- **`stitch/rollingShutter` builds it from the attitude**: rows run top to bottom in every lens's
  image, the first row is read at the frame's time on the motion clock and the last a readout later,
  and the turn is carried into the lens frame through `imuToCamera` (ADR 0010).
- **The order and timing were chosen on footage, by how still a world-locked view stays between two
  consecutive frames.** Thirty-three milliseconds apart, the camera barely translates, so parallax
  drops out, while a fast turn moves the view by about as much as the readout skews it. The seam
  could not decide this: the ONE R's lenses are flipped about the axis the rows run along, so both
  lenses read any seam direction at the same instant and the shutter cancels across the seam. Across
  eleven fast-turn windows, top-to-bottom from the timestamp gave the largest summed improvement and
  the most wins, the mirror order made things worse, and a readout along the other image axis did
  not stand out; in most windows the differences were within noise, and the strongest turn decided
  it.

- **Rechecked on the levelled attitude (ADR 0016),** with the jitter of the earlier fused attitude
  gone: over ten freefall moments, the row the frame's timestamp marks was searched at the first
  row, a quarter, the middle, three quarters and the last; the first row or a quarter won seven,
  the last row two, and the first row has the best sum. The first-row timing stands.

## Consequences

- On a two-second canopy turn the correction made a world-locked view about 7 percent stiller frame
  to frame. It matters only in fast motion; in steady flight it changes nothing visible.
- The evidence is modest. A recording with sustained fast rotation over textured, distant scenery,
  or Insta360's own statement of the readout, would settle the order more firmly; the builder keeps
  the order in one place so it can change.
- It costs a second projection per lens per output pixel, which the GPU shader will pay the same
  way.
