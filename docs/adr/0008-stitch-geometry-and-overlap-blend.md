# ADR 0008: Stitch geometry and overlap blend

Status: accepted (2026-10-19), the blend provisional until evaluated on real footage

## Context

Stitching fills an equirectangular output: every output pixel must find the direction it looks
along, which lens or lenses saw that direction, and how to combine them where two lenses overlap.
The optics (ADR 0007) turn a direction into a lens pixel; this is the geometry above them, and it is
the reference the GPU shader implements.

## Decision

- **Equirectangular output frame.** A normalized output coordinate maps to a unit direction:
  longitude runs `-pi` to `+pi` left to right, latitude `+pi/2` to `-pi/2` top to bottom, the centre
  looks along `+x` and up is `+z`. This is pure geometry (`stitch/equirectangular`), invertible away
  from the poles and the wrap seam.
- **Stabilization composes by rotation, not by its own code.** The output direction is rotated by the
  per-frame stabilization correction (ADR 0006) into the camera frame before the lenses are
  consulted. That rotation is the existing quaternion `rotate`, so the stitch geometry takes a
  camera-frame direction and owns no stabilization logic.
- **Lens selection and a margin-weighted feather.** `stitch/stitchSample` projects the direction
  into every lens, keeps the ones that cover it, and weights each by its margin (how far inside the
  field of view the direction sits, ADR 0007). The weights are the margins normalized, so they sum
  to one and fall to zero at a lens's edge, handing off smoothly across the overlap. A direction no
  lens covers yields nothing, a hole the caller can see. A lone lens gets full weight even at its
  exact edge.

## Consequences

- With the ONE R's overlapping lenses the two margins give a linear cross-fade through the seam; it
  is a partition of unity over the whole sphere, proven by a test summing the weights to one for any
  output direction.
- The feather is deliberately simple. It does not match exposure across the seam or blend across
  multiple frequency bands, so a visible exposure step or a doubled edge at the seam is expected
  until those land (M8+). Both are refinements layered on the same lens selection, not changes to it.
- The geometry is frame-consistent but not yet aligned to the camera's real forward or the image's
  pixel-row order; those conventions (ADR 0007's pose, this frame) are the first things a wrong-
  looking stitch will expose, and each is an isolated constant.
