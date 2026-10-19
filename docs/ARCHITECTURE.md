# Architecture

web360 is a hexagonal TypeScript monorepo. The core is pure: it knows no browser API, no
Node API and no npm package. Everything that touches I/O, the GPU or a codec is an adapter that
implements a port the core defines. `.dependency-cruiser.cjs` enforces every rule below.

## Packages

| Path                  | Role                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`       | The vendor-neutral model of a recording and the pure functions over it. No runtime dependencies.                                             |
| `packages/adapters/*` | One adapter per outside concern: byte sources (`fetch`, `blob`, `node`), demuxing, decoding, WebGL rendering. Each depends on the core only. |
| `packages/web360`     | The published package: the public API, wiring the core to the adapters.                                                                      |
| `tools/*`             | Development tools: repository checks, fixture builders, inspection and measurement.                                                          |
| `examples/*`          | Unpublished examples built on the public API, such as a minimal player.                                                                      |

Packages are added when they first hold code.

## Inside the core

| Folder                            | Holds                                                                             | May import                      |
| --------------------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `shared/`                         | Units, bytes, maths, errors                                                       | nothing outside `shared/`       |
| `format/<vendor>/`                | Reading one vendor's files into the common model                                  | `shared/`, the model, the ports |
| `model/`                          | `CameraRecording` and its parts: tracks, optics, motion, timing                   | `shared/`                       |
| `motion/`, `optics/`, `analysis/` | Pure computations on the model                                                    | `shared/`, `model/`             |
| `ports/`                          | Interfaces the adapters implement (`RandomAccessSource`, frame sources and sinks) | `shared/`, `model/`             |

Only `format/` reads bytes. Vendor readers never import each other: each produces the same model,
and everything downstream works on that model without knowing the vendor.

## Public API shape

- `open(source)` gives a `CameraRecording`: metadata, motion samples, timing, optics.
- Per-frame processing: decoded lens frames plus a time or orientation in, a stitched or
  reprojected frame out. A real-time player calls it once per displayed frame.
- Batch processing: the frames of a span, in order, for an encoder.
- Analysis: stabilization quality, motion and seam metrics.

There is no playback state anywhere in the library.
