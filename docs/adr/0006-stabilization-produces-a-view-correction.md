# ADR 0006: Stabilization produces a per-sample view correction

Status: accepted (2026-10-19)

## Context

With attitude available over time (ADR 0004, drift-corrected by ADR 0005), stabilization decides
how the view should move: hold the whole world still, keep only the horizon flat, or follow slow
pans. A renderer needs one consistent thing from every mode so it does not special-case them, and
the modes differ only in what of the camera's motion they keep.

## Decision

- **Every mode produces a `StabilizationSample { timestamp, correction }` per attitude sample**,
  and the stabilized view a renderer shows is `correction ⊗ cameraAttitude`. A renderer rotates
  the sphere by the correction to reach that view. One shape, so modes are interchangeable.
- **Lock to world** cancels all of the camera's rotation: the correction maps every attitude back
  onto the first sample's, so the view holds a fixed world frame, heading included. (A rendition
  defaults to `smooth`, ADR 0015.)
- **Horizon leveling** keeps the heading and removes the tilt. The attitude is split about the
  world vertical by a swing-twist decomposition into a heading (the rotation about the vertical)
  and a tilt (the remainder); the correction keeps the heading and cancels the tilt, so the
  stabilized view is a pure rotation about the vertical. The horizon stays flat while a pan still
  pans. A camera pointed along the vertical has no heading there, and the split yields no heading
  rather than failing.
- **Smoothed heading** keeps the horizon level the same way, but the view's heading follows an
  exponential smoothing of the camera's heading rather than following it exactly: each sample
  slerps the running heading toward the camera's by `1 - exp(-dt / timeConstant)`, forward through
  the stream and then backward over the result. Smoothing both ways in time is what keeps a
  deliberate pan from lagging: a one-way filter trails it by about the time constant, and the
  backward pass leads by the same amount. It needs the whole stream, which a recording has. The time
  constant is the mode's tuning surface, a larger one smoothing toward a locked heading and a
  vanishing one reducing to horizon leveling.
- **Following the camera** (`followCamera`) runs the same two-way smoothing on the whole attitude
  rather than the heading alone. The horizon is not levelled: the view leans and rolls with the
  camera, without its shake, and a steady turn comes through without delay.

## Consequences

- A mode is a function from an attitude stream to a correction stream; adding one (a smoothed
  heading that low-passes the vertical rotation, say) is another function of the same shape, not a
  change to the renderer contract.
- The correction is on the attitude's clock. A renderer that needs it at a frame's time
  interpolates, the same slerp the attitude needs (ADR 0004).
- Horizon leveling trusts the vertical it is given, so it is only as upright as the fused attitude
  under it (ADR 0005); it does not itself consult the accelerometer.
