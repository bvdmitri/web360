# ADR 0003: One vendor-neutral recording model

Status: accepted (2026-10-19); its optics extended for cube maps by ADR 0020 and its motion by
ADR 0023

## Context

Each camera maker states a recording differently: Insta360 keeps telemetry and calibration in a
trailer, GoPro in a GPMF track, and their optics differ (fisheye lenses against an equiangular
cube map). Everything downstream (motion, stitching, analysis) and every maker must meet on one
shape, or each would carry the others' quirks.

## Decision

- **`CameraRecording` is the one shape every reader fills and every computation reads.** It holds
  what a recording is (model, frame rate, frame size), how its lenses see (`LensOptics`), how it
  moved (two `MotionSample` streams, `angularVelocity` and `acceleration`), how its frames are
  timed (`FrameExposure`, a rolling shutter, a capture clock). A reader under `format/<vendor>/`
  maps its files into it; nothing downstream knows the vendor.
- **Motion is two independently-timed streams, not one fused sample.** `angularVelocity` and
  `acceleration` are separate lists on the capture clock, each at its sensor's own rate. GoPro
  records its gyroscope faster than its accelerometer (around 800 Hz against 200 Hz), so a single
  fused sample per tick cannot hold its telemetry without inventing accelerometer readings, which
  an analysis library must not do. An Insta360's fused record splits into the two streams sharing
  their timestamps, which is lossless. A camera that records its own gravity direction carries it
  as a third stream, `gravity` (ADR 0023).
- **It is telemetry, optics and timing, not pixels.** A frame's bytes are decoded through a port
  at processing time, so the model carries no video tracks and stays free of I/O. This is why a
  split recording's two lens files do not appear as two tracks here: the model states the two
  lenses' optics, and the opened recording (`OpenedRecording`, ADR 0013) says where each lens's
  frames are.
- **Quantities are branded units.** Timestamps are microseconds on the capture clock, exposure
  and the rolling shutter are seconds, orientations are degrees; vectors (angular velocity in
  rad/s, acceleration in m/s^2) are plain number triples. Acceleration is SI, so a reader whose
  camera reports g (Insta360) converts it; GoPro already writes m/s^2.
- **Two kinds of picture.** `LensOptics` and its `LensProjection` describe a fisheye lens the
  stitch projects through (the equidistant model, ADR 0007). A camera that stitches its own lenses
  into an equi-angular cube map has no lenses to describe: its `lenses` are empty and its
  `OpenedRecording.cube` carries the cube's faces (ADR 0020). `LensProjection` is a union a further
  lens model can join.

## Consequences

- A reader's output and a computation's input are the same type, named once, so a vendor reader is
  tested by the recording it produces and a computation by the recording it is given.
- A further maker is a new `format/<vendor>/` folder that fills `CameraRecording`; where its optics
  or motion do not fit, the model grows under this ADR rather than each reader inventing its own.
