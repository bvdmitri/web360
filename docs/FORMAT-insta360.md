# Insta360 (`.insv`)

Facts about the files Insta360 cameras write, as `format/insta360` reads them, verified on the
committed ONE R fixture (`test/fixtures/insta360/oner-split-00.insv`, the ONE R with its 5.7K 360
lens module; structure and telemetry only). A fact verified on the ONE R says so; a fact no fixture
confirms yet is marked provisional. Every integer and float in the trailer is little-endian.

## Files

A recording's files are named `VID_<date>_<time>_<lens><proxy>_<sequence>.insv`: an eight-digit
date, a six-digit time, a two-digit stream code and a sequence number.

- **The stream code's first digit is the lens**: 0 the back lens, 1 the screen-side lens. A camera
  that splits its lenses across two files (the ONE R) writes `_00_` and `_10_`; the `_00_` file
  carries the trailer below, and only the video of the `_10_` file is read.
- **The second digit marks a proxy** when it is not 0. Low-resolution previews are named with the
  `LRV` prefix (`LRV_<date>_<time>_<lens><proxy>_<sequence>`, extension `.insv` or `.lrv`), and
  their names parse as proxies.
- The two lens files of one recording share the prefix, date, time and sequence, which is how they
  pair; a preview, with its other prefix, does not pair with them. The name is a hint: the reader
  still checks the files' contents.

## Container

An ISO base media file (see [FORMAT-iso-bmff.md](./FORMAT-iso-bmff.md)) followed by the Insta360
trailer. On the ONE R each lens file holds three tracks: one H.264 video at 2880 by 2880 (one lens,
29.97 fps), AAC audio, and a timed-text metadata track (not read).

Which video holds which lens is decided by aspect against the calibration canvas (below): a video
with the aspect of one lens's share of the canvas holds one lens, scaled to that share.

- **One lens per file** (the ONE R, measured): the `_00_` video is lens 0 and the `_10_` video is
  lens 1, each covering half the canvas. The `_00_` file alone cannot be opened.
- **One track per lens in one file**: lens `i` is track `i`. Provisional: covered by an edited
  variant of the ONE R fixture, not by a recording of a body that writes it.
- **Any other video** covers the whole canvas for every lens. Provisional, in the same way.

## Trailer

The trailer sits at the end of the `_00_` file. Its last 72 bytes are a footer:

| From the end of the file | Size | Meaning                                                  |
| ------------------------ | ---- | -------------------------------------------------------- |
| 32                       | 32   | magic: the ASCII text `8db42d694ccc418790edff439fe026bf` |
| 36                       | 4    | trailer version, `u32` (3 on the ONE R)                  |
| 40                       | 4    | trailer length in bytes, footer included, `u32`          |

A file whose magic differs is not an Insta360 recording. A reader fetches the footer, then the
trailer length, and never the media before it.

Each record is a payload followed by a 6-byte header: a format tag (`u8`), the record id (`u8`) and
the payload size (`u32`). The header of the record nearest the footer sits just before the footer.

- **Contiguous layout** (the ONE R, measured): records sit back to back, so the reader walks
  backward from the footer, each header giving the size of the payload before it, until it reaches
  the trailer's start.
- **Indexed layout** (provisional, covered by a synthetic test only): when the record nearest the
  footer has id 0, it is an index of 10-byte slots, each an id (`u8`), a format tag (`u8`), a size
  (`u32`) and an offset (`u32`) from the trailer's start. A slot with id 0 or size 0 is empty.

The ONE R fixture's trailer holds records 1, 2, 3, 4, 5, 9, 10, 11 and 12, and no location record.
The reader uses three of them:

| Id  | Holds                                         | Used for                                    |
| --- | --------------------------------------------- | ------------------------------------------- |
| 1   | the info message (protobuf, below)            | model, frame size, rate, clock, calibration |
| 3   | the fused accelerometer and gyroscope samples | motion                                      |
| 4   | per-frame exposure entries                    | frame timing                                |

The other records are not read.

## Info record (id 1)

A protobuf message (varint, length-delimited and 64-bit fields). The fields read, with the values
the ONE R states:

| Field | Type    | Meaning                                                 | ONE R           |
| ----- | ------- | ------------------------------------------------------- | --------------- |
| 2     | string  | camera model                                            | `Insta360 OneR` |
| 5     | string  | lens calibration (`offset`, below)                      | starts `2_`     |
| 19    | message | frame size: field 1 width, field 2 height (varints)     | 2880 by 2880    |
| 20    | varint  | frame rate, rounded                                     | 30              |
| 24    | varint  | first frame's timestamp on the capture clock            | 3401538         |
| 25    | double  | rolling-shutter readout, milliseconds                   | 22.28           |
| 28    | double  | gyro offset, milliseconds                               | 1.5             |
| 29    | varint  | the gyro offset is set                                  | 1               |
| 62    | varint  | the gyro record uses the raw layout                     | 1               |
| 65    | message | sensor ranges: field 1 accelerometer, field 2 gyroscope | 32 g, 2000 dps  |

The capture clock counts microseconds when field 62 is set. The frame size is the size of one
lens's video on the ONE R. The gyro offset is read but not applied: on ONE R footage a swept offset
between the motion and the picture changed how still a stabilized view stays by at most a frame's
worth, so none is applied (ADR 0010).

## Calibration

Field 5 holds the v1 `offset` string: underscore-separated numbers, a lens count, then six numbers
a lens, then the canvas width and height and a version word.

```text
<lenses>_<radius>_<centre x>_<centre y>_<yaw>_<pitch>_<roll>_(the next lens's six)_..._
<canvas width>_<canvas height>_<version>
```

(one string, broken here for width).

- **Radius and centre** are pixels on the calibration canvas, the two lenses side by side: lens 0
  on the left half, lens 1 on the right. On the ONE R the canvas is 6080 by 3040, lens 0 has radius
  1476.98 at (1514.07, 1523.14), and lens 1 is centred near x 4557.
- **Yaw, pitch and roll** are degrees, the pose of the lens frame in the camera frame: yaw about
  `z`, then pitch about `x`, then roll about `y` (ADR 0007). The back lens's roll is near 180
  degrees (-179.115 on the ONE R). The roll axis is measured on the ONE R; the Euler order and the
  pitch and yaw axes are provisional, as the ONE R's pitch and yaw are under a degree.
- **Only the v1 layout is read.** A string with more numbers a lens (the v2, v3 and v6 layouts),
  or one too short, is refused.

## Lens model

The string states neither the lens's projection nor its angle, so the reader supplies them.

- **Equidistant fisheye**: the distance from the lens centre is proportional to the angle from the
  optical axis, `r = f * theta`, with `f = radius / (fieldOfView / 2)`.
- **Field of view, 183 degrees**: the full angle that reaches the calibration radius. Measured on
  ONE R footage, where the two lenses register best across the seam on far-field (freefall) frames.
- **Coverage, 185 degrees** (about 1.011 times the radius): how far out the image is trusted, inside
  the illuminated circle's dark border. Measured on ONE R footage (ADR 0019).
- **Vignetting**: flat to a reach of 0.998, then darker by `exp(-4.78 * (reach^2 - 0.998^2))`, alike
  in both lenses. Measured on ONE R footage by averaging a frame a second over a whole recording
  (ADR 0017).

The reader applies these ONE R values to every Insta360 body: for any other body they are
provisional.

## Motion (record 3)

The raw layout (field 62 set): 20-byte samples, each a `u64` timestamp in microseconds on the
capture clock, then three accelerometer and three gyroscope components. Each component is a `u16`
in offset binary around 32768, scaled to its range from field 65:
`(value - 32768) / 32768 * range`. Accelerometer components are in g (the model converts them to
m/s^2 with 9.80665), gyroscope components in degrees per second (converted to rad/s).

- One timestamp serves both sensors, so the two motion streams share their timestamps.
- On the ONE R samples are 1 ms apart (1 kHz), and the fixture's first accelerometer sample reads
  about 1 g.
- The older float layout (field 62 unset) is not read.

**IMU to camera.** The IMU's axes sit a quarter turn about `x` from the calibration frame, the IMU's
`z` along the calibration frame's `y`. Measured on ONE R footage: of the 24 axis-aligned rotations
it is the one that keeps a world-locked view stillest through fast turns (ADR 0010). Provisional for
every other body.

## Exposure (record 4)

16-byte entries, each a `u64` capture timestamp (microseconds in the raw-gyro layout) and an `f64`
exposure time in seconds (5.87 ms for the ONE R fixture's first). Entries begin a few frames before
the first encoded frame. On the ONE R they step at the video's 29.97 fps, and field 24 matches the
entry of the first video frame to a few microseconds, so a frame shown `t` into the video was
captured at field 24 plus `t` (ADR 0010).

## Rolling shutter

Field 25 is the readout time of one lens's sensor (22.28 ms on the ONE R). The file does not state
the readout's direction or which row the frame's timestamp marks. The stitch reads rows top to
bottom in every lens, the first row at the frame's timestamp; chosen on ONE R footage, by modest
evidence (ADR 0011). Provisional for every other body.
