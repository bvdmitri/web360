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

- **GoPro reader** (`format/gopro`): the GPMF telemetry walker (`gpmf`) and the shared `format/mp4`
  reading of the `.360` container are done, on a de-identified GoPro MAX fixture. What remains is
  decoding the telemetry streams (gyro, accel, timing) and the EAC projection, then assembling them
  into the same `CameraRecording` and generalising the optics for the cube map.
- **`open()`**: the public, vendor-agnostic entry point that reads a source into a
  `CameraRecording`, wiring the byte source and a split recording's two files through adapters.

The MP4 edit list (a track's presentation shift) is a later refinement of `format/mp4`, added when
a consumer needs presentation time rather than media-clock time.

### Later

- Motion (orientation, stabilization modes), optics (camera models), stitching behind a GPU port,
  and analysis (stabilization quality, motion, seams).
- Adapters (`packages/adapters/*`: byte sources, demuxing, decoding, WebGL) and the published
  package (`packages/web360`).

### Deferred

- DJI (`.osv`): planned, not started; no fixture describes it yet.
- Any player, clock, audio sync or UI: belongs to the consuming application.

## Current state and next step

The Insta360 path is complete to the model: `readInsta360Recording` turns the real ONE R fixture
into a `CameraRecording` (metadata, two lens optics, 145232 motion samples, exposures, rolling
shutter, capture clock), on top of the finished `format/mp4` container reader.

The GoPro reader is underway. The `format/mp4` reader already reads the real GoPro MAX `.360`
(six tracks, the dual EAC video at 5888x1920, and the `gpmd` telemetry track located by each
track's sample format), on its own de-identified fixture. `format/gopro/gpmf` walks the GPMF
telemetry (big-endian key-length-value: `DEVC` to `STRM` to the leaf streams), proven on the
fixture's first sample (a populated gyroscope stream, a GPS stream scrubbed to zero). What remains
for GoPro is assembling those streams and the EAC container into a `CameraRecording` and
generalising the optics for the cube map.

Assembling GoPro motion forces a model decision: GoPro records accelerometer and gyroscope as
separate GPMF streams, possibly at different rates, where Insta360 gives one fused sample per tick.
`CameraRecording.motion` is a single fused stream today; GoPro likely needs it split into
independently timed streams. That is the next major decision to settle before the GoPro recording
assembler lands (it changes the model and ADR 0003).

Beyond that, processing the model stays open: orientation from the motion samples, the camera
projection from the optics, and stitching behind a GPU port. `open()` (the public entry wiring a
byte source and a split recording's two files) comes with the adapters.

To resume: `pnpm install`, then `pnpm verify` should be green. Read [CLAUDE.md](./CLAUDE.md), then
the document in [docs/](./docs) for the area about to change.
