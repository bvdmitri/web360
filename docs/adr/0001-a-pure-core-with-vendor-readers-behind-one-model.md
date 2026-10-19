# ADR 0001: A pure core with vendor readers behind one model

Status: accepted (2026-10-19)

## Context

web360 reads 360 recordings from more than one camera maker and turns them into data and pictures
a browser application can use. The recordings differ in container, telemetry layout, lens optics
and projection, and more makers will follow. The library must run in a browser, must be testable
without a browser or a real camera file on every test, and must not grow a maker's quirks into
the parts that compute motion, stitch, or measure.

## Decision

- **The core is pure.** `packages/core` holds a vendor-neutral model of a recording and the pure
  functions over it, with no browser API, no Node API and no npm runtime dependency. Everything
  that touches I/O, a codec or the GPU is an adapter that implements a port the core defines.
- **One model, many readers.** Each maker has a reader under `format/<vendor>/` that turns that
  maker's files into the one model. Readers never import one another: everything downstream works
  on the model without knowing the maker.
- **Only `format/` reads bytes.** The rest of the core receives decoded values. The byte reader
  and the unit types live in `shared/`, which knows nothing of the model above it.
- **The layers are enforced, not just described.** `.dependency-cruiser.cjs` holds every import
  rule in this decision as a build-breaking check.
- **No playback.** No clock, audio sync, transport or UI lives in any published package. A player
  is an application that calls the library once per frame; examples of that live in `examples/`
  and are not published.

## Consequences

- A reader is tested against a small fixture and a decoded expectation, with no browser.
- A new maker is one new folder under `format/` and one new format doc, with no change to the
  model's consumers once the model already carries what the maker needs.
- The published package (`packages/web360`) is thin: it wires the core to the adapters and exposes
  the public API. The adapters carry all the platform detail.
- When the model does not yet carry something a maker needs, the model grows first, with its own
  test, and the reader follows.
