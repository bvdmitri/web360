# ADR 0004: Orientation integrates the gyro stream as a quaternion

Status: accepted (2026-10-19)

## Context

A recording carries angular velocity as timestamped body-frame samples in radians per second (ADR
0003). Stabilization and motion analysis need the camera's attitude over time, not its rate of
turn. That attitude has to come from integrating the gyro stream, and the integration has choices
(the rotation representation, the quadrature rule, the composition order) that downstream code
should not each re-decide.

## Decision

- **Attitude is a unit quaternion per gyro sample**, mapping the body frame to the world frame,
  carried as `OrientationSample { timestamp, orientation }` in `motion/`. It is derived data, not
  part of the recording model: a reader fills `CameraRecording`, and `integrateOrientation` turns
  that recording's angular-velocity stream into attitude.
- **The first sample's attitude is the identity.** Orientation is relative to how the camera was
  held when the stream begins. Anchoring it to an absolute frame (gravity, heading) is a
  stabilization mode layered on top, not part of the raw integration.
- **Each step is the exponential map of a rotation vector** (`quaternion.fromRotationVector`). The
  step from one sample to the next uses the average of the two bracketing angular-velocity
  readings times the elapsed time (the trapezoidal rule), which is symmetric and costs nothing at
  these sample rates. The step rotation is composed onto the running attitude by right
  multiplication, because the gyro measures rates in the body frame, and the result is
  renormalized each step so rounding cannot let it drift off the unit sphere.

## Consequences

- The accelerometer is not used here. Gravity gives an absolute vertical that corrects integration
  drift, but that is horizon leveling, a stabilization mode that reads the acceleration stream
  separately, not part of attitude integration.
- Pure gyro integration drifts over time; a recording long enough for drift to matter is corrected
  by a later mode, not by changing this integrator.
- Attitude is sampled on the gyro clock, so a consumer that needs it at a frame's time interpolates
  between samples (`quaternion.slerp`).
