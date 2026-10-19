# ADR 0007: Equidistant fisheye lens optics

Status: accepted (2026-10-19), the ONE R values measured on real footage, the Euler order provisional

## Context

Stitching needs to turn a direction in space into the pixel a lens saw, and back. The Insta360 v1
calibration gives, per lens, a fisheye `radius`, a `center`, and a `yaw`/`pitch`/`roll` pose (ADR
0003). It does not give a field of view or a focal length, it does not say how the fisheye maps
angles to pixels, and it does not say how far out the image is usable. Those have to be chosen, and
the choice governs where every output pixel samples the lenses.

## Decision

- **The lens is an equidistant fisheye:** the pixel distance from the lens centre is proportional to
  the angle from the optical axis, `r = f · θ`. This is the simplest fisheye model and the one the v1
  calibration is written for.
- **Two angles describe a lens, and they are kept apart.** `fieldOfView` is the mapping: the full
  angle that reaches the calibration `radius`, so `f = radius / (fieldOfView / 2)`. `coverage` is how
  much of the sphere the lens is trusted to image, which sets where the overlap with the other lens
  is and so how wide the seam blend can be. They differ because the illuminated image extends past
  `radius`. Tying them together forces a choice between a correct mapping with almost no overlap and
  a usable overlap with a wrong mapping.
- **Both are per-camera-model constants the reader supplies**, not read from the file, the same kind
  of external fact as a camera's IMU frame. For the ONE R they were measured on the owner's footage:
  the mapping at 183 degrees is where the two lenses' log brightness correlates best across a fixed
  band on the seam (`stitch/seamCorrelation`, consistent across three freefall frames where the
  scene is far away and parallax is negligible; the first guess of 193 degrees was 10 degrees too
  wide and visibly doubled the seam), and the coverage at 188 degrees is where the 2880-pixel frame
  crops the illuminated circle, about 1.03 times the radius, so no trusted pixel falls off the frame.
- **The pose maps the lens frame to the camera frame** by yaw about Z, pitch about X and roll about
  Y, composed as a quaternion. Projecting a camera-frame direction rotates it into the lens frame
  first; unprojecting a pixel rotates the recovered lens-frame direction back out. Roll is about Y
  so the back lens's near-180-degree roll flips the optical axis to the far hemisphere and keeps the
  two lenses' azimuth in register; the same roll about X would leave the hemispheres 180 degrees
  apart. This was confirmed by stitching the real ONE R: the wrong axis put the same object at
  opposite longitudes in the two lenses.
- **Projection reports where a direction lands and how much to trust it:** the pixel, the `reach`
  (distance from the centre over `radius`, which exceeds 1 inside the coverage past the radius), and
  the `margin` inside the coverage, so the stitch can pick a lens and weight the overlap (ADR 0008).

## Consequences

- The optics are pure core, tested by round-tripping a direction through project then unproject and
  by known-angle cases, independent of any camera. Their agreement with the real lens is measured on
  footage, not asserted by a unit test; the developer harness (`stitch/preview.test.ts`) sweeps the
  mapping and reports the seam correlation for exactly that.
- The mapping, coverage and pose convention are where a wrong assumption shows up as a visibly wrong
  stitch; each is an isolated constant, and `LensProjection` stays a union that a unified or Mei
  model can join if equidistant proves too coarse away from the seam. The Euler order and the small
  pitch and yaw axes are not yet distinguished by the one ONE R calibration available (its pitch and
  yaw are under a degree) and stay provisional until another camera or the authoritative reference
  pins them.
- Acceleration, timing and stabilization are untouched here; optics is only the direction-to-pixel
  map.
