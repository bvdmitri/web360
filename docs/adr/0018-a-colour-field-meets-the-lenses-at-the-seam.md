# ADR 0018: A colour field meets the lenses at the seam

Status: accepted (2026-10-20)

## Context

With the vignetting measured (ADR 0017), a colour step still shows across the seam in the sky
where one lens faces the sun: that lens's sky carries glare, a haze of about the same amount in
every channel, while the other's does not. One gain per lens (ADR 0008) scales a whole lens and
cannot follow a difference that is additive and changes around the seam. A per-direction ratio,
read from one texel per direction, is too noisy where a person or the camera's mount
sits on the seam (the lenses see different things there through parallax) and cannot follow an
added haze.

## Decision

- **`stitch/seamColour` holds a field of 32 directions around the seam**, each an additive
  difference per channel (the second lens over the first), after each lens's falloff and gain.
- **Each direction is measured on a patch**: four azimuths across its share of the ring by five
  offsets within two degrees of the seam, in both lenses, leaving out saturated and black samples.
  A patch whose differences disagree among themselves (more than 0.06 spread) is not trusted, and
  its value is filled from the trusted directions either side. The field is smoothed around the ring
  and limited to 0.4.
- **Each lens is moved halfway toward the other at the seam**, the share fading as `cos^2` to
  nothing 45 degrees either side, so the correction is spread wide enough not to draw a band of its
  own. A direction's place on the seam is its azimuth in the first lens's frame and half the
  difference of its angles from the two optical axes (`seamPosition`).
- **It is part of each frame's colour estimate** (`estimateColour`) and of the stitch: the reference
  compositor and the shader apply it identically (the packed frame carries it after the shutter
  table), and a rendition eases it over time like the gains, linearly.

## Consequences

- On ONE R freefall footage the field removes most of the bright band along the seam in a
  sun-facing sky;
  under canopy, with little glare, the field changes nothing visible.
- It corrects colour, not geometry: a near object on the seam still shows parallax.
- Only two-lens cameras have a seam field.
