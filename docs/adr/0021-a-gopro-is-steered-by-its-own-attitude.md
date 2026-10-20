# ADR 0021: A GoPro is steered by its own attitude

Status: accepted (2026-10-20); its attitude source and clock superseded by ADR 0023

## Context

ADR 0016 integrates the gyro and levels it by the accelerometer. A GoPro MAX or MAX2 also writes
its own fused attitude, `CORI`, with a gravity direction, `GRAV`, one of each per frame
(FORMAT-gopro.md). The camera fuses its sensors at their full rate, before they are decimated
into the file, so its attitude is at least as good as one integrated from the stored gyro. What
the file does not state is how its quaternions map onto the cube, which way they turn, how its
clock meets the picture's, and whether `GRAV` is a true vertical.

## Decision

- **`CameraRecording.reportedAttitude`** carries a camera's own attitude (`attitude`, body to
  world) and the up direction in its body frame (`up`), sample by sample. `rendition/attitude.ts`
  prefers it to integrating the gyro.
- **`CORI` is read as stored `w, x, y, z` and conjugated**: the camera writes the world's turn to
  the body. Its frame is x right, y down, z forward; `imuToCamera` turns it into the cube's frame
  (front `+x`, up `+z`) by `{ w: 0.5, x: -0.5, y: 0.5, z: -0.5 }`. Found on MAX2 footage by
  steering a fast-turning view with each of the 24 axis-aligned rotations and measuring how still
  the world held between frames a third of a second apart: 6.54 against 4.76 for the next.
- **`GRAV` negated is the up direction**, in the same body frame as `CORI` (the levelled vertical
  scattered least with it, 0.12 against 0.49 for any other alignment). `levelAttitude` levels the
  attitude by it over the same four-second window as ADR 0016, every reading counted alike
  (`trust: 'every-reading'`): `GRAV` is a unit vector, so there is no magnitude to doubt.
- **The telemetry runs 30 ms behind the picture.** The same stillness measure peaks smoothly at
  a 30 ms offset (6.88 against 6.54 at none, falling either side), so the reader sets
  `captureClock` to 30 ms.
- **`IORI` is not applied.** Composing it, either way round, did not change how level or still
  the stabilized picture is; the stored picture is the camera's unturned cube.

## Consequences

- Stabilized MAX2 stills are level at the moments checked, a canopy turn and a spiral included.
  An apparent dome there was the developer harness rendering without the correction, not `GRAV`.
- Longer levelling windows scored worse, and weighting `GRAV` by the accelerometer's magnitude
  changed nothing, so neither is used.
- The alignment, offset and up source are measured on the MAX2 only; the original MAX uses them
  as provisional values until its footage is measured.
- `stitch/goproPreview.test.ts` holds the searches a new body is measured with
  (`WEB360_GOPRO_SEARCH`, `_OFFSETS`, `_HORIZON`) and renders a stabilized still with
  `WEB360_GOPRO_STAB`.
