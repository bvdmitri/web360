# ADR 0007: Equidistant fisheye lens optics

Status: accepted (2026-10-19), provisional until the stitch is evaluated on real footage

## Context

Stitching needs to turn a direction in space into the pixel a lens saw, and back. The Insta360 v1
calibration gives, per lens, a fisheye image-circle `radius`, a `center`, and a `yaw`/`pitch`/`roll`
pose (ADR 0003). It does not give a field of view or a focal length, and it does not say how the
fisheye maps angles to pixels. Those have to be chosen, and the choice governs where every output
pixel samples the lenses.

## Decision

- **The lens is an equidistant fisheye:** the pixel distance from the lens centre is proportional to
  the angle from the optical axis, `r = f · θ`. This is the simplest fisheye model and the one the v1
  calibration is written for. `f` (pixels per radian) is derived as `radius / (fieldOfView / 2)`: the
  image-circle `radius` is the pixel radius reached at the edge of the field of view.
- **The field of view is a per-camera-model constant the reader supplies**, not read from the file,
  because the v1 string does not carry it. It is physical knowledge about the lens, the same kind of
  external fact as a camera's IMU frame. `LensOptics` carries it as `fieldOfView`, so a lens is
  self-describing and the optics functions need no hidden constant. The ONE R value is provisional
  and expected to be refined once the stitch is seen on real footage.
- **The pose maps the lens frame to the camera frame** by yaw about Z, then pitch about Y, then roll
  about X (intrinsic), built as a quaternion. Projecting a camera-frame direction rotates it into the
  lens frame first; unprojecting a pixel rotates the recovered lens-frame direction back out.
- **Coverage is explicit.** A direction is covered by a lens only when its angle from the optical
  axis is within the field of view's half-angle. Projection reports coverage so the stitch can pick a
  lens and weight the overlap (ADR 0008), rather than sampling outside the fisheye circle.

## Consequences

- The optics are pure core, tested by round-tripping a direction through project then unproject and
  by known-angle cases, independent of any camera. Their agreement with Insta360's actual lens is a
  separate question, settled by looking at the stitch, not by a unit test.
- The field-of-view constant and the pose convention (the Euler order, the sign of roll) are the two
  places a wrong assumption shows up as a visibly wrong stitch; both are isolated so a correction is
  a one-line change, and `LensProjection` stays a union that a unified or Mei model can join later.
- Acceleration, timing and stabilization are untouched here; optics is only the direction-to-pixel
  map.
