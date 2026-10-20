# GoPro 360 (`.360`)

Facts about the files the GoPro MAX and MAX2 write, verified on the committed MAX fixture
(`test/fixtures/gopro/max-eac.360`, structure and telemetry only) and on a private MAX2 recording
(firmware H24.02, 8K mode). A fact verified on one body only says so. Public references used for
orientation: GoPro's GPMF specification (github.com/gopro/gpmf-parser, Apache-2.0 or MIT) and the
MAX geometry published with max2sphere (Apache-2.0).

## Container

An ISO base media file (see [FORMAT-iso-bmff.md](./FORMAT-iso-bmff.md)) holding:

- **two HEVC video tracks** of the same size, each one half of an equi-angular cube map (below).
  MAX 5.6K: 4096 by 1344. MAX2 8K: 5888 by 1920, Main profile, level 6.0, 8-bit full-range
  (`yuvj420p`), 29.97 fps;
- stereo AAC audio, and a four-channel PCM ambisonic track (24-bit on the MAX2);
- a timecode track (`tmcd`);
- the telemetry track: sample format `gpmd`, handler "GoPro MET".

Tracks are told apart by handler and format, not position: the order differs by model and mode.

## Picture: an equi-angular cube map stitched in camera

The camera stitches its two lenses itself; each video track holds three cube faces side by side.

- **Face size is the track height** (1344 on the MAX at 5.6K, 1920 on the MAX2 at 8K).
- **The first and last face of each track are wider by a band** of `(width - 3 * height) / 2`
  pixels (32 on the MAX at 5.6K, 64 on the MAX2 at 8K): the camera's own seam between its lenses
  runs down the middle of those faces, and the band holds the same columns twice, once from each
  lens. On the MAX2 the seams sit at columns 992 and 4896 of both tracks (a sharp step in the
  picture), and the 64 columns before each seam repeat the 64 after it (correlation 0.998 at a shift
  of 64 on a textured frame). The middle face carries no seam, and the edges between neighbouring
  faces (columns 1984 and 3904 on the MAX2) are continuous.
- **Faces are equi-angular**: pixels are evenly spaced in angle across a face, not in tangent, so a
  face coordinate maps to a direction through `atan` rather than linearly.
- **Which face is where.** Measured on MAX2 frames by matching every face edge against every other
  (the pixel line just inside each edge; the true neighbours correlate at 0.93 to 0.999, and every
  pair matches both ways): the first track holds the left, front and right faces, the second the
  down, back and up faces, each stored with its columns as `u` and rows as `v`. In the camera's
  cube frame (front along `+x`, `+z` up, `-y` to the front's right), a face's direction for face
  coordinates `u, v` in `[-1, 1]` is `centre + tan(u * pi/4) * across + tan(v * pi/4) * down`:

  | Track | Face  | Centre | `across` (u) | `down` (v) | Seam band |
  | ----- | ----- | ------ | ------------ | ---------- | --------- |
  | 1     | left  | `+y`   | `+x`         | `-z`       | yes       |
  | 1     | front | `+x`   | `-y`         | `-z`       | no        |
  | 1     | right | `-y`   | `-x`         | `-z`       | yes       |
  | 2     | down  | `-z`   | `-x`         | `+y`       | yes       |
  | 2     | back  | `-x`   | `+z`         | `+y`       | no        |
  | 2     | up    | `+z`   | `+x`         | `+y`       | yes       |

  The second track's faces are therefore turned a quarter against the first's. The original MAX is
  stated by its public geometry to share this order; it is not yet measured on its frames.

- **The band in a seamed face** sits at its middle: the face's logical columns `[F/2 - b/2, F/2 +
b/2)` (face size `F`, band `b`) are stored twice, first as seen by one lens and then, immediately
  after, as seen by the other, and the rest of the face follows; a seamed face is `F + b` columns
  wide in the track.

## Telemetry (GPMF)

The `gpmd` track's samples are GPMF payloads: big-endian key-length-value records (four-character
key, a one-byte type, a one-byte structure size, a big-endian two-byte repeat count, the data padded
to four bytes), with `DEVC` containing `STRM` streams. Each stream carries sticky labels (`STNM`
name, `SIUN` unit, `ORIN` axis order, `SCAL` divisor, `STMP` start time) and one data record, its
last child. A payload covers about a second, and its samples are spaced evenly over the sample's
duration on the track's media clock.

- `DVNM`, in the `DEVC`: the camera's name (`MAX2` on the MAX2).
- `GYRO` (rad/s, 800 Hz on the MAX2), `ACCL` (m/s^2), `MAGN`: signed 16-bit triples over `SCAL`. `ORIN` names, per
  channel, the camera axis it measures, lower case meaning negated (`ZXY` on both bodies: Z, X, Y in
  that order). The reader applies it, then turns the result onto the orientation frame's axes
  (x, y, z to -x, -z, -y, measured on the MAX2, ADR 0023). Steered by the gyro, the picture shook
  least with each frame matched to the gyro 10 ms after it.
- `SHUT`: exposure time in seconds, 32-bit float, one per frame, no `SCAL`.
- `CORI`, `IORI`: signed 16-bit quaternions over `SCAL` 32767, one per frame. `CORI` is the camera's
  orientation since the recording began, `IORI` the turn the camera applied to the image relative
  to its body. On the MAX2 `IORI` is a small turn about a single axis (a few degrees). The stored
  order is `w, x, y, z`. Measured on the MAX2 (ADR 0021): `CORI` is the world's turn to the body,
  in a frame of x right, y down, z forward; the cube's frame is that frame turned by
  `{ w: 0.5, x: -0.5, y: 0.5, z: -0.5 }`. `CORI` is the gyro sampled once a frame (ADR 0023): its
  turn rates match the gyro's to a scale of 1.000, about 5 ms ahead of it.
- `GRAV`: the gravity direction, a signed 16-bit unit vector over `SCAL` 32767, one per frame, in
  the same body frame as `CORI` (measured on the MAX2). Negated, it is up.
- Also present and not used: `WBAL`, `WRGB`, `ISOE`, `UNIF`, `PRJT`, `MNOR`, `OCNF`, `WNDM`, `MWET`,
  `AALP`, `MSKP`, `LSKP`, `CSCT`, `CSCB`, `LRVO`, `LRVS`, `TMPC`. **`GPS9` / `GPSA` / `LVGP`
  (location) and `FACE` (detected face boxes) are personal data**: a fixture zeroes them.

## Files

A recording longer than about 4 GB is split into chapters named `GS<chapter><number>.360`: two
digits of chapter, then the recording's four-digit number. `.LRV` files beside them are
low-resolution proxies.
