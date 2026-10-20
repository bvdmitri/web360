# ADR 0016: The attitude is levelled offline

Status: accepted (2026-10-20)

## Context

The rendition took its attitude from the Mahony filter (ADR 0005), which nudges the integrated gyro
toward the accelerometer at every sample. In freefall the accelerometer reads drag and every arch,
turn and grip, from under 1 to over 40 m/s² on the ONE R recording, and with a proportional gain of
1 rad/s the filter chased it: measured against plain gyro integration, it added 0.27 to 0.44
degrees of rotation per frame on average (up to 1.8), while the camera itself turned about 0.5
degrees a frame in steady freefall. Stabilized video came out shakier than a gyro-only stitcher's.
A rendition has the whole recording, so the vertical does not have to be decided as it goes.

## Decision

- **`motion/levelOrientation` integrates the gyro and levels it slowly.** Each accelerometer
  reading is turned into the integrated frame and weighted by how near its magnitude is to one g
  (a Gaussian of a fifth of g), the readings are summed in tenth-of-a-second bins and averaged with a
  Gaussian of four seconds both ways in time, and the attitude is turned by the smallest tilt that
  takes that averaged up to the world's. Heading is the gyro's.
- **The rendition uses it** in place of `fuseOrientation`, which stays for streaming uses that
  cannot look ahead.

## Consequences

- On the ONE R recording the rotation added per frame falls to 0.02 to 0.06 degrees, ten times less,
  and the whole recording levels in under two tenths of a second.
- The vertical follows the gyro's drift, not the jumper's motion. Where the accelerometer is far from
  one g for long (leaving the plane) the vertical comes from the readings around it, so the first
  seconds of freefall level only as well as the plane ride and the freefall after say.
- The averaged vertical is the accelerometer's: a constant tilt between the IMU and the lenses, or an
  accelerometer bias, shows as a constant tilt of the horizon, which this does not remove.
