# web360 plan and progress

A living roadmap: what web360 is, how it is built, what stands done, and what comes next. Read it
with [CLAUDE.md](./CLAUDE.md) (the rules) and [docs/](./docs) (the design) to pick the work up on
another machine or in a fresh session.

## What web360 is

Functions to read, analyse, stitch, stabilize and process 360 video in the browser, across camera
makers, behind one vendor-neutral model. It is not a player: playback belongs to the application
that uses it. Insta360 and GoPro are the first makers; DJI waits until a fixture describes it.

## How it is built

- A pure hexagonal core (`packages/core`): the model and the computations over it, with no
  browser, Node or npm runtime dependency. I/O, codecs and the GPU are adapters behind ports.
- One model, many readers. Each maker has a reader under `format/<vendor>/` that produces the one
  model; readers never import each other. The shared container reader is `format/mp4`.
- Each vendor format is written down as facts verified against our own fixtures, and a reader is
  built from those facts and from published methods. A public format reference may be pointed to;
  nothing is copied from another project.
- Strict TDD: a failing test first, property tests for parsers and maths, coverage at 95 lines and
  90 branches, and mutation testing on the core. `pnpm verify` is the gate.

See [CLAUDE.md](./CLAUDE.md) for the full rules and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
for the layering.

## Phases

### Done

- **Workspace and tooling.** A pnpm monorepo with strict TypeScript, lint at zero warnings,
  layering rules, coverage and mutation gates, the repository checks (private samples and em or en
  dashes stay out of commits), and CI.
- **Core foundations.** Branded units (`shared/units`) and a bounds-checked byte reader
  (`shared/binary`) that reads little- and big-endian integers, floats and text.
- **Container reader** (`format/mp4`). Walks the ISO base media file box tree and assembles a
  `moov` into a movie of tracks: each track's id, handler, media timescale, visual sample entry
  (codec, coded size, NAL length size), and its samples placed and timed on the media clock from
  the sample tables. A fragmented file is refused. See
  [docs/FORMAT-iso-bmff.md](./docs/FORMAT-iso-bmff.md) and ADR 0002.
- **The recording model** (`model/`). `CameraRecording`, the one vendor-neutral shape every reader
  fills and every computation reads: metadata, lens optics, motion samples and frame timing. The
  optics are a provisional v1 fisheye until a second vendor lands. See ADR 0003.
- **Insta360 reader** (`format/insta360`). Reads a recording's trailer (contiguous or indexed) and
  its info, gyro, exposure and v1 calibration records, parses file names, and assembles them into a
  `CameraRecording`, confirmed on the real ONE R fixture.

### Remaining readers

- **GoPro reader** (`format/gopro`): the GPMF telemetry walker (`gpmf`), the per-stream decoder
  (`stream`, scaling the signed-16-bit sensor streams to physical units with their labels and block
  start time), and the shared `format/mp4` reading of the `.360` container are done, on a
  de-identified GoPro MAX fixture. What remains is per-sample timing (spacing a block's samples by
  the container's sample duration), the EAC projection, and assembling the streams into the same
  `CameraRecording` while generalising the optics for the cube map.
- **`open()`**: the public, vendor-agnostic entry point that reads a source into a
  `CameraRecording`, wiring the byte source and a split recording's two files through adapters.

The MP4 edit list (a track's presentation shift) is a later refinement of `format/mp4`, added when
a consumer needs presentation time rather than media-clock time.

### Motion (underway)

- `shared/math/quaternion` is the rotation primitive. `motion/integrateOrientation` turns a
  recording's angular-velocity stream into a unit-quaternion attitude per sample (ADR 0004), and
  `motion/fuseOrientation` fuses it with the acceleration stream into a drift-corrected attitude by
  a Mahony complementary filter (ADR 0005), both proven on the real ONE R tracks. On top of the
  attitude, `motion/lockToWorld`, `motion/levelHorizon` and `motion/smoothHeading` are the
  stabilization modes, each a per-sample view correction (ADR 0006), and `quaternion.slerp` is the
  interpolation a renderer samples attitude or correction with at a frame's time. The motion layer
  is complete to the model: a recording becomes drift-corrected attitude and a stabilized view.

### Stitch (underway, toward replacing GyroView in cutaway)

- `optics/lens` projects a camera-frame direction to a lens pixel and back for the Insta360
  equidistant fisheye model (ADR 0007), from the calibration's radius, centre and pose plus a
  per-model field of view the reader supplies (the v1 string carries none; the ONE R value is
  provisional, refined on visual evaluation).
- `stitch/equirectangular` maps an output coordinate to a unit direction and back, and
  `stitch/stitchSample` picks the covering lens(es) and weights the overlap by each lens's margin, a
  partition of unity over the whole sphere that feathers to zero at a lens edge (ADR 0008).
  Stabilization composes by rotating the output direction before sampling (no new code).
- `stitch/renderEquirectangular` is the CPU reference compositor (the golden image for the GPU
  shader), and `stitch/preview.test.ts` is an env-gated harness that stitches a frame of real
  footage to a PNG. Run it on a `_00_` file with
  `WEB360_PREVIEW_INSV=<path> WEB360_PREVIEW_OUT=<png> pnpm --filter @web360/core exec vitest run
src/stitch/preview` (add `WEB360_PREVIEW_TINT=1` or `WEB360_PREVIEW_ONLY=0|1` to diagnose). On the
  ONE R it now produces a registered stitch; the roll axis was found and fixed this way (ADR 0007).
- Visible, not yet addressed: the seam is a hard feather with an exposure step between the lenses,
  and near objects ghost from parallax. Next: seam quality in the CPU reference (exposure matching,
  wider blend), then the WebGPU renderer (M3), WebCodecs decode (M4), `openRendition` and the
  published package (M5-M6), and the cutaway swap (M7). See the session plan.

### Later

- The deferred GoPro EAC optics, and analysis (stabilization quality, motion, seams).
- Adapters (`packages/adapters/*`: byte sources, demuxing, decoding, WebGL) and the published
  package (`packages/web360`).

### Deferred

- DJI (`.osv`): planned, not started; no fixture describes it yet.
- Any player, clock, audio sync or UI: belongs to the consuming application.

## Current state and next step

The Insta360 path is complete to the model: `readInsta360Recording` turns the real ONE R fixture
into a `CameraRecording` (metadata, two lens optics, split gyro and accel streams, exposures,
rolling shutter, capture clock), on top of the finished `format/mp4` container reader.

The GoPro telemetry path is complete. The `format/mp4` reader reads the real GoPro MAX `.360` (six
tracks, the dual EAC video at 5888x1920, and the `gpmd` telemetry track located by each track's
sample format). `format/gopro/gpmf` walks the GPMF telemetry (big-endian key-length-value: `DEVC`
to `STRM` to the leaf streams), `format/gopro/stream` decodes a stream to physical units, and
`format/gopro/motion` assembles the `gpmd` track into the two motion streams with per-sample
timing (each payload's samples spaced over the mp4 sample's duration on the media clock). On the
fixture the gyroscope reads near 800 Hz and the accelerometer near 200 Hz, each on a monotonic
clock. The model carries motion as two independently-timed streams (ADR 0003), so both vendors fit.

What remains for a full GoPro `CameraRecording` is the non-telemetry parts, and they turn on the
optics decision ADR 0003 deferred until the second vendor: the GoPro MAX stores its sphere as a
dual-track equi-angular cube map, which the fisheye-shaped `LensOptics` cannot describe. Settling
how the model represents EAC optics (and what `frame` and `lenses` mean for a two-track camera, how
rolling shutter is sourced when GPMF does not carry it, and decoding the float `SHUT` exposure
stream) is the next major decision. The motion path above does not depend on it.

Beyond that, processing the model stays open: orientation from the motion samples, the camera
projection from the optics, and stitching behind a GPU port. `open()` (the public entry wiring a
byte source and a split recording's two files) comes with the adapters.

To resume: `pnpm install`, then `pnpm verify` should be green. Read [CLAUDE.md](./CLAUDE.md), then
the document in [docs/](./docs) for the area about to change.
