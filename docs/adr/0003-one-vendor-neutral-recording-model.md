# ADR 0003: One vendor-neutral recording model

Status: accepted (2026-10-19), the optics part provisional until a second vendor lands

## Context

Each camera maker states a recording differently: Insta360 keeps telemetry and calibration in a
trailer, GoPro in a GPMF track, and their optics differ (fisheye lenses against an equiangular
cube map). Everything downstream (motion, stitching, analysis) and every maker must meet on one
shape, or each would carry the others' quirks.

## Decision

- **`CameraRecording` is the one shape every reader fills and every computation reads.** It holds
  what a recording is (model, frame rate, frame size), how its lenses see (`LensOptics`), how it
  moved (`MotionSample`), how its frames are timed (`FrameExposure`, a rolling shutter, a capture
  clock). A reader under `format/<vendor>/` maps its files into it; nothing downstream knows the
  vendor.
- **It is telemetry, optics and timing, not pixels.** A frame's bytes are decoded through a port
  at processing time, so the model carries no video tracks and stays free of I/O. This is why a
  split recording's two lens files do not appear as two tracks here: the model states the two
  lenses' optics, and the adapter hands over each lens's frames when asked.
- **Quantities are branded units.** Timestamps are microseconds on the capture clock, exposure
  and the rolling shutter are seconds, orientations are degrees; vectors (angular velocity in
  rad/s, acceleration in g) are plain number triples until the motion layer gives them a type.
- **The optics are provisional.** `LensOptics` and its `LensProjection` describe the v1 fisheye
  lenses the ONE R writes. The projection is a union that will grow (the Mei model, the GoPro cube
  map), and the optics will generalise when the second vendor lands rather than being guessed now.

## Consequences

- A reader's output and a computation's input are the same type, named once, so a vendor reader is
  tested by the recording it produces and a computation by the recording it is given.
- Adding GoPro or DJI is a new `format/<vendor>/` folder that fills `CameraRecording`; where its
  optics do not fit the fisheye shape, the model grows under this ADR rather than each reader
  inventing its own.
- The model will change as the second vendor and the motion layer arrive; it is early and not yet
  published, so that is expected, not a break.
