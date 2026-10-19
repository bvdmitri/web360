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

### Insta360 and GoPro readers

In order:

1. **Fixtures.** Short, face-free clips cut from real recordings, held in Git LFS, each with a
   manifest entry of origin and coverage. See [docs/SAMPLES.md](./docs/SAMPLES.md).
2. **Insta360 reader** (`format/insta360`): the trailer (indexed and contiguous), the info, gyro,
   exposure and trim records, the file-name pairing, and the calibration strings.
3. **GoPro reader** (`format/gopro`): the `.360` container and its projection, and the GPMF
   telemetry track.
4. **The model and `open()`**: the vendor-neutral `CameraRecording` the readers fill, and the
   public entry point that returns it.

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

The container reader (`format/mp4`) is complete, and the vendor side is underway on a
de-identified Insta360 ONE R fixture (`test/fixtures/insta360/oner-split-00.insv`). `format/insta360`
locates the trailer, lists its records (contiguous or indexed), and reads the info record (a small
built-in protobuf scanner gives the model, frame size, frame rate, first-frame timestamp, rolling
shutter, gyro offset and ranges, and the raw calibration string). The next task reads the gyro and
exposure records and parses the calibration string into lens poses, then `RecordingFileName`
pairing of a split recording's two files, building toward the vendor-neutral model and `open()`.

To resume: `pnpm install`, then `pnpm verify` should be green. Read [CLAUDE.md](./CLAUDE.md), then
the document in [docs/](./docs) for the area about to change.
