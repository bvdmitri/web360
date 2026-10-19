# ADR 0005: Drift-corrected attitude by sensor fusion

Status: accepted (2026-10-19)

## Context

Integrating the gyro stream alone (ADR 0004) drifts: small rate errors accumulate, so over a long
recording the horizon slowly tilts and the heading wanders. The accelerometer measures the
direction of gravity absolutely, with no drift, but it is corrupted by the camera's own linear
acceleration, and a skydive is nothing but large linear accelerations (near zero g in freefall,
hard spikes at canopy opening). Neither sensor alone gives a stable vertical. Horizon leveling and
heading smoothing both need an attitude whose vertical stays correct, so the two streams have to be
fused, and the fusion method is a decision the modes above it should not each re-make.

## Decision

- **Attitude is fused by a Mahony-style complementary filter.** The gyro is integrated as before
  (ADR 0004); on top of each step, the accelerometer nudges the attitude so its estimated gravity
  direction tracks the measured one. The nudge is a PI feedback on the cross-product error between
  the measured and estimated gravity directions: a proportional term and an integral term are
  added to the gyro rate before the exponential-map step. The proportional term pulls the vertical
  back; the integral term cancels a constant gyro bias outright.
- **The gyro is trusted short-term, the accelerometer only slowly.** The gains are small, so a
  transient linear acceleration (which briefly makes the accelerometer point somewhere other than
  down) is overwhelmingly rejected by the gyro, while the slow pull keeps the vertical honest over
  the whole recording. The gains are the filter's tuning surface and are expected to be adjusted;
  they are not a published contract.
- **The streams are aligned by a causal cursor.** The gyro runs faster than the accelerometer on
  some cameras (a GoPro logs gyro several times as often), so each gyro step uses the most recent
  accelerometer sample at or before its time. A recording with no accelerometer degrades to plain
  integration.

## Consequences

- The filter observes only what gravity constrains: roll and pitch (the vertical) are corrected,
  but heading about the vertical is not, because turning about gravity does not change the gravity
  direction. Heading drift is a separate concern, addressed by a heading mode, not here.
- The accelerometer's magnitude is not used, only its direction, so the filter does not need the
  reading to be exactly one g; it tolerates the magnitude swings of freefall.
- A gentler or firmer response is a gain change, not a code change; a more elaborate filter
  (Madgwick's gradient step) would slot in behind the same attitude output if the complementary
  filter ever proves too crude.
