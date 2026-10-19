# ADR 0010: The IMU-to-lens alignment and frame timing

Status: accepted (2026-10-19), measured on the ONE R

## Context

The attitude integrated from the gyro and accelerometer (ADR 0004, 0005) is in the IMU's axes, and
the lens poses are in the calibration frame (ADR 0007). Stabilizing a stitched frame chains them
(ADR 0006): an output direction goes to the world by the stabilized view, into the body by the
inverse attitude, and into the lens frame. That last step needs the rotation from the IMU's axes to
the lens frame, which the recording does not state. The frame also has to be stabilized with the
attitude of the instant it was captured, so frames and motion must share a clock.

## Decision

- **`CameraRecording.imuToCamera` carries the IMU-to-lens rotation**, a per-camera-model constant
  the reader supplies. `motion/outputToCamera(imuToCamera, attitude, view)` composes the per-frame
  stitch rotation from it.
- **It is measured from the footage, among the 24 axis alignments.** An IMU is mounted square to the
  body, so the rotation is one of the cube's rotations (`motion/axisAlignments`). With the right one,
  locking the view to the world makes two frames a couple of seconds apart show the same scene; with
  a wrong one, the view turns between them. The developer harness ranks the candidates by the
  correlation between those two locked renders (`WEB360_PREVIEW_IMU_SEARCH`).
- **Measure where the camera turns hard.** In steady belly-flying freefall the camera turns only a
  few degrees in two seconds, and every candidate looks still. Canopy turns (90 to 130 degrees in two
  seconds, with the ground in view) separate them: on the ONE R a quarter turn about X (the IMU's z
  along the lens frame's y) won in five of six such windows, and stabilizing with it levels the
  horizon with the canopy overhead.
- **A frame shown `t` into the video was captured at `captureClock + t`** on the motion clock. The
  trailer's exposure records step at the video's 29.97 frames per second and include a few pre-roll
  frames, and `captureClock` matches the record of the first video frame to a few microseconds. A
  swept offset between the clocks moved the stillness by at most a frame's worth (20 ms), so none is
  applied.

## Consequences

- A world-locked view holds a correlation near 0.75, not near 1, through canopy turns. The limit is
  most likely what is close to the camera (the canopy, its lines, the jumper's own rig), which no
  rotation keeps still, and rolling shutter, which is not yet corrected; the alignment itself is
  unambiguous where the camera turns.
- Another camera model needs its own measurement; the harness search is the tool, and a recording
  with hard turns over distant scenery is the input.
