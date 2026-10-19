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
- **Container box layer** (`format/mp4`). Walks the ISO base media file box tree (a 32-bit size, a
  64-bit largesize, or a size that runs to the end of its region), finds and walks boxes, and
  refuses a malformed size. See [docs/FORMAT-iso-bmff.md](./docs/FORMAT-iso-bmff.md).

### Insta360 and GoPro readers

In order:

1. **MP4 sample table** (`format/mp4`): the movie header, the tracks (id, timescales, handler),
   the sample entry and its codec, the time, size, chunk and sync tables, the edit list, and
   timing to the sample. Fragmented files are refused.
2. **Fixtures.** Short, face-free clips cut from real recordings, held in Git LFS, each with a
   manifest entry of origin and coverage. See [docs/SAMPLES.md](./docs/SAMPLES.md).
3. **Insta360 reader** (`format/insta360`): the trailer (indexed and contiguous), the info, gyro,
   exposure and trim records, the file-name pairing, and the calibration strings.
4. **GoPro reader** (`format/gopro`): the `.360` container and its projection, and the GPMF
   telemetry track.
5. **The model and `open()`**: the vendor-neutral `CameraRecording` the readers fill, and the
   public entry point that returns it.

### Later

- Motion (orientation, stabilization modes), optics (camera models), stitching behind a GPU port,
  and analysis (stabilization quality, motion, seams).
- Adapters (`packages/adapters/*`: byte sources, demuxing, decoding, WebGL) and the published
  package (`packages/web360`).

### Deferred

- DJI (`.osv`): planned, not started; no fixture describes it yet.
- Any player, clock, audio sync or UI: belongs to the consuming application.

## Current state and next step

The container reader (`format/mp4`) walks the box tree and reads the pieces of a track: the movie
and media timescales, the track id, the handler, the visual sample entry (codec, coded size, NAL
length size), and the sample-table boxes (`stts`, `ctts`, `stss`, `stsz`, `stsc`, `stco` and
`co64`). The next task assembles these into a movie of tracks, each with its edit list and its
samples timed to the media clock, and refuses a fragmented file.

To resume: `pnpm install`, then `pnpm verify` should be green. Read [CLAUDE.md](./CLAUDE.md), then
the document in [docs/](./docs) for the area about to change.
