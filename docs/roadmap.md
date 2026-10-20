# Roadmap

What web360 does today and what comes next. Read it with [CLAUDE.md](../CLAUDE.md) (the rules) and
these pages (the design and the file formats).

## What exists

- **Insta360 (`.insv`)** (`format/insta360`, [FORMAT-insta360.md](./FORMAT-insta360.md)): the
  trailer, the info, motion and exposure records and the v1 calibration, a single file or a split
  `_00_`/`_10_` pair. The ONE R with its 5.7K 360 lens is measured: its field of view, coverage,
  vignetting, IMU alignment and rolling-shutter order come from ONE R footage, and a fixture covers
  it. Other Insta360 bodies open and stitch with the ONE R's values, which are provisional for them.
- **GoPro (`.360`)** (`format/gopro`, [FORMAT-gopro.md](./FORMAT-gopro.md)): the GPMF
  telemetry and the dual-track equi-angular cube map, chapters joined. The MAX2 is measured: its
  cube layout, gyro alignment and telemetry delay come from MAX2 footage. The original MAX opens
  with the MAX2's values; it is provisional and no fixture of it is committed.
- **The container** (`format/mp4`, [FORMAT-iso-bmff.md](./FORMAT-iso-bmff.md)): the box tree
  and sample tables, read from random-access sources without loading the media.
- **Motion**: gyro integration levelled offline by the accelerometer or the camera's own gravity
  (ADR 0016, 0023), and the stabilization modes `off`, `lock`, `horizon`, `smooth` and `follow`
  (ADR 0006).
- **Stitch and render on WebGPU** (`packages/adapters/webgpu`): the lens stitch with measured
  vignetting, gains, a seam colour field and rolling-shutter correction (ADR 0012, 0017, 0018,
  0019), and the cube-map renderer (ADR 0020), each checked against a CPU reference.
- **Decode on WebCodecs** (`packages/adapters/webcodecs`).
- **`openRendition`** (`@bvdmitri/web360` on npm): the files of a recording in, stitched and
  stabilized equirectangular `VideoFrame`s out (ADR 0015).

## What is next

- **Insta360 breadth**: other bodies from the facts their files state (the indexed trailer, the v2,
  v3 and v6 calibration layouts, a track per lens), each with its own measured optics and IMU
  alignment and a fixture.
- **DJI Osmo 360 (`.osv`)**: planned, not started; no fixture describes it yet.
- **CAMM and generic dual-fisheye recordings**: cameras that write the standard camera motion
  metadata track, or a plain dual-fisheye video.
- **The original GoPro MAX**: measuring its cube layout, alignment and delay on its own footage,
  with a fixture.

Any player, clock, audio sync or UI stays out of scope: it belongs to the application.
