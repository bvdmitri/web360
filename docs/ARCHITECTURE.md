# Architecture

web360 is a hexagonal TypeScript monorepo. The core is pure: it knows no browser API, no
Node API and no npm package. Everything that touches I/O, the GPU or a codec is an adapter that
implements a port the core defines, or lives in the published package that wires them together.
`.dependency-cruiser.cjs` enforces the import rules below.

## Packages

| Path                          | Role                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`               | `@web360/core`: the vendor-neutral model of a recording, the vendor readers and the pure functions over them. No runtime dependencies.            |
| `packages/adapters/webgpu`    | `@web360/webgpu`: the WGSL passes that render the lens stitch (`createStitcher`) and a cube map (`createCubeRenderer`). Depends on the core only. |
| `packages/adapters/webcodecs` | `@web360/webcodecs`: decoding an `EncodedVideo` with WebCodecs (`decodeVideo`, `browserCodecs`). Depends on the core only.                        |
| `packages/web360`             | `@bvdmitri/web360`, the published package: the public API, wiring the core to the adapters and the browser. It bundles the workspace packages.    |
| `tools/checks`                | The repository checks: no em or en dashes, no private sample terms, no personal data in a fixture.                                                |

## Inside the core

| Folder             | Holds                                                                                                     | Imports                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `shared/`          | Units, the byte reader, quaternion maths                                                                  | nothing outside `shared/`                                    |
| `model/`           | `CameraRecording` and its parts (optics, motion, timing), `OpenedRecording`, `EncodedVideo`, the cube map | `shared/`                                                    |
| `ports/`           | `RandomAccessSource`, the port a byte source implements, and `memorySource`                               | nothing                                                      |
| `format/mp4/`      | The ISO base media container reader                                                                       | `shared/`, `model/`, `ports/`                                |
| `format/<vendor>/` | Reading one vendor's files (`insta360`, `gopro`) into the model                                           | `shared/`, `model/`, `ports/`, `format/mp4`, `motion/` types |
| `motion/`          | Orientation from the motion samples, levelling, stabilization modes                                       | `shared/`, `model/`                                          |
| `optics/`          | The equidistant fisheye lens and the equi-angular cube map                                                | `shared/`, `model/`                                          |
| `stitch/`          | The CPU reference stitch and cube render, colour estimation, rolling shutter, the packed GPU layouts      | `shared/`, `model/`, `motion/`, `optics/`                    |
| `rendition/`       | Planning a rendition: the frames of a span, the attitude and stabilized view, each frame's stitch         | `shared/`, `model/`, `motion/`, `stitch/`                    |

Only `format/` reads bytes. Vendor readers never import each other: each produces the same model,
and everything downstream works on that model without knowing the vendor. The core never imports
an adapter, the published package or a tool, and an adapter never imports another adapter.

## Public API

`@bvdmitri/web360` exports (`packages/web360/src/index.ts`):

- `openRendition(source, options)`: opens a recording from the files a user picked (a
  `RenditionSource` of `Blob`s: `main`, a split Insta360 recording's `second`, a GoPro's
  `following` chapters) and gives a `Rendition`, whose `frames()` yields stitched, stabilized
  equirectangular `VideoFrame`s for a span (ADR 0015).
- `Web360Error` and its `Web360ErrorCode`: why opening or rendering failed.
- `browserPlatform()` and the `Platform` and `Presenter` types: the browser as the rendition sees
  it (decoders, a GPU device, how frames move), which a test replaces.
- `blobSource(blob)` (`packages/web360/src/blob.ts`): a `RandomAccessSource` over a `Blob`.
- The types `RecordingFile`, `RenditionSource`, `RenditionOptions`, `RenditionMetadata`,
  `Rendition` and `Stabilization`.

There is no playback state anywhere in the library.
