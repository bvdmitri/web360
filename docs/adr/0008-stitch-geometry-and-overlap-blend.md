# ADR 0008: Stitch geometry and overlap blend

Status: accepted (2026-10-19), the blend provisional until evaluated on real footage; its per-frame vignetting is superseded by ADR 0017

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
- The feather is deliberately simple. Exposure is matched separately: `stitch/estimateGains` averages
  what each lens records over the overlap and scales each lens, per channel, onto the geometric mean,
  which removes the brightness and colour step between the lenses (on the ONE R the two disagree by
  about a quarter, differently per channel). Vignetting is corrected before that:
  `stitch/estimateVignetting` measures the rim falloff from how the two lenses' brightness ratio
  varies across the overlap (one lens is nearer its rim than the other there), and
  `stitch/devignette` lifts each lens by the inverse. The overlap only spans the rim, so the falloff
  is applied as a hinge, `exp(-k * (reach^2 - start^2))` beyond the overlap's innermost reach and
  nothing inside it: a single `exp(-k * reach^2)` curve extrapolated the steep rim slope into the
  lens centre and blew the image out. The order matters: flatten first, then match exposure on the
  flattened lenses. Both are estimated per frame here, which is noisy where the seam crosses
  something close to the camera; for video they should be held steady across frames. A multiband
  blend for edges doubled by parallax is still to come; all of these layer on the same lens
  selection.
- The geometry is frame-consistent but not yet aligned to the camera's real forward or the image's
  pixel-row order; those conventions (ADR 0007's pose, this frame) are the first things a wrong-
  looking stitch will expose, and each is an isolated constant.
