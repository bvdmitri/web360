# ADR 0017: Vignetting is measured per camera

Status: accepted (2026-10-20)

## Context

ADR 0008 estimated each frame's vignetting from the overlap: the log ratio of the two lenses'
brightness against the difference of their squared reach. On the ONE R that put a bright arc along
the seam in the sky. Two facts explain it:

- The overlap cannot measure the falloff where the seam is. A direction there sits at about the
  same reach in both lenses, and a pair of directions either side of it compares one lens at
  `0.98 + d` with the other at `0.98 - d`: the overlap pins how the falloff differs across the seam,
  never its level at the seam, which the fitted curve then fills in by assumption. Across a jump the
  per-frame strength ranged from 1.4 to 3.4, lifting the seam by about a fifth.
- Averaging a frame a second of each lens over a whole jump (the scene averages out as the camera
  turns) shows the falloff directly: within a few percent flat out to a reach of 0.99, then dropping
  steeply where the image circle ends, to about 0.96 of the plateau at 1.00, 0.85 at 1.01, 0.77 at
  1.02 and 0.70 at 1.03, alike in both lenses. The camera evens out its image inside the circle; the
  overlap's outer half lies on the circle's edge.

## Decision

- **`LensOptics.vignetting` is a property of the lens**, supplied by the reader per camera model
  like the field of view (ADR 0007): the same `exp(-strength * (reach^2 - start^2))` beyond `start`.
  For the ONE R, fitted to the averaged profile of both lenses: strength 4.78 from a reach of 0.998.
- **The stitch flattens each lens by its own vignetting**: `devignette` reads it from the optics,
  `packStitch` carries it per lens, and a lens without one is taken as evenly lit.
- **The colour estimate per frame is gains only** (`estimateColour`); `estimateVignetting` stays as a
  diagnostic. The harness's `WEB360_PREVIEW_FLAT_FIELD=1` measures a camera's profile, and
  `WEB360_PREVIEW_VIGNETTE_SCAN=1` shows the per-frame estimates.

## Consequences

- The bright arc is gone. What remains at the seam is a colour difference between the lenses that
  varies around it (glare from the sun in one lens), which one gain per lens cannot follow.
- Another camera body is measured the same way before its value is trusted; until then it takes the
  ONE R's along with its other optics (ADR 0013).
