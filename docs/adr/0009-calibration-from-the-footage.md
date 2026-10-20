# ADR 0009: Calibration measured from the footage

Status: accepted (2026-10-19), the refinement not yet applied by default

## Context

The v1 calibration gives each lens a centre, a radius and a pose, but no mapping angle and no
coverage (ADR 0007), and its small pose angles are read through an Euler convention that one camera
cannot fully pin down. A wrong mapping or pose shows as a doubled seam. The footage itself holds the
answer: where two lenses see the same far-away scene, the right parameters make them agree.

## Decision

- **Registration is scored by `stitch/seamCorrelation`:** the normalized cross-correlation of the
  two lenses' log brightness over a fixed band on the seam, scaled by the share of the band both
  lenses saw. It ignores exposure and contrast, peaks when the lenses register, and cannot be
  gamed by pushing awkward directions out of coverage. It ranks parameters on one frame; it is not
  an absolute score.
- **Measure on far-field frames.** Freefall and open sky put the scene at effective infinity, so
  parallax vanishes and only the parameters remain. On the ONE R footage this placed the mapping at
  183 degrees on three freefall frames independently (ADR 0007).
- **Refinement is shared mapping plus relative pose.** `stitch/refineCalibration` runs coordinate
  descent on the correlation over one focal length shared by every lens and the pose of every lens
  after the first. Separate focal lengths are not identifiable from the seam: on a thin band one
  lens a little long and the other a little short register almost as well as both right, so they
  drift along that ridge. On a synthetic rig rendered with known optics it recovers the mapping and
  the back lens's pose to a twentieth of a degree.

## Consequences

- On ONE R footage the refinement is not stable: the back lens's yaw varies by several degrees
  between freefall frames. The camera's mount sits on the seam in every frame, a few centimetres
  from the lenses; its parallax pulls the pose toward a compromise, and clouds
  and the sun add content-dependent optima. It stays a tool, run from the preview harness
  (`WEB360_PREVIEW_REFINE`), not a default.
- Making it a default needs two things: excluding the rig, which is detectable because it never
  moves relative to the lenses (pixels whose content stays the same across the recording), and
  aggregating across many far-field frames rather than trusting one. Both build on the same score.
- The same footage-first approach applies to the other per-model constants (coverage, vignetting):
  measure them where the scene allows, rather than guessing.
