# ADR 0023: A GoPro is steered by its gyro, levelled by its own gravity

Status: accepted (2026-10-20). Supersedes ADR 0021's attitude source and clock; its cube
alignment and up source stand.

## Context

ADR 0021 steered a GoPro by its own fused attitude, `CORI`, one quaternion per frame, 30 ms after
each frame. Stabilized MAX2 footage then looked a little shaky beside the ONE R's: fine jitter,
some wobble, even on still moments in the plane. ADR 0021's measures (stillness over a third of a
second, horizon levelness) could not see frame-to-frame jitter.

## Measurements (MAX2, developer harnesses)

- **Jitter** (`stitch/residualMotion.ts`, `stitch/goproJitter.test.ts`): sixteen consecutive frames
  at six moments (two in the plane, two in freefall, two under canopy) rendered under `lock`. The
  measure is the root mean square change of patch shifts from one pair of frames to the next, in
  degrees; a steady pan counts as none.

  | Steering                                | Mean jitter  |
  | --------------------------------------- | ------------ |
  | none                                    | 1.67         |
  | `CORI`, 30 ms (ADR 0021)                | 1.25         |
  | `CORI`, 0 to 10 ms                      | 1.14 to 1.16 |
  | gyro levelled by `GRAV`, 10 ms          | 1.13         |
  | `CORI` with `IORI` composed, either way | 1.38 to 1.49 |

  The rest is what turning the whole picture cannot remove: near objects moving on their own,
  texture-poor sky.

- **The gyro against `CORI`** (`stitch/goproRates.test.ts`): the gyro runs at 800 Hz. Fitting the
  rates of `CORI`'s frame-to-frame turns to the gyro's gives a scale of 1.000 and a turn under a
  twentieth of a degree, with the gyro about 5 ms behind. So `CORI` is the gyro sampled once a
  frame, and ADR 0021's 30 ms put it a frame late for anything faster than a turn.
- **Rolling shutter**: steering each direction by the attitude when its sensor row was read
  (readouts from -30 to 30 ms, either way down the sensor) changed the jitter by no more than its
  noise, so the cube map is not corrected for it.
- Judged by eye on MAX2 clips of the three candidates: `CORI` at 5 ms and the gyro at 10 ms are
  both steadier than ADR 0021's, the gyro slightly so.

## Decision

- The GoPro reader turns the gyro and accelerometer onto the orientation frame's axes by the
  measured half turn (x, y, z to -x, -z, -y), so `imuToCamera` stays ADR 0021's, and sets
  `captureClock` to 10 ms.
- `CameraRecording.gravity` carries the camera's own up readings (`GRAV` negated). `attitudeOf`
  always integrates the gyro (ADR 0016) and levels it by `gravity` when a camera writes one, every
  reading counted alike, and by the accelerometer near one g otherwise. `CameraRecording` carries
  no reported attitude, and no renderer reads `CORI`.
- `IORI` stays unused.

## Consequences

- MAX2 stabilization follows the gyro at 800 Hz, as the ONE R's does, with the horizon from the
  camera's gravity.
- The original MAX takes the MAX2's turn and clock until its footage is measured.
- The harnesses (`goproJitter`, `goproRates`, `goproPreview`) are how a new body is measured.
