# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.1] - 2026-10-26

### Changed

- Built with tsdown 0.23.1, and the development tools updated (eslint, typescript-eslint,
  dependency-cruiser, typedoc-plugin-markdown).

## [0.6.0] - 2026-10-20

### Added

- Flat views of an equirectangular 360 video: a `View` of pan, tilt, roll, field of view and lens
  distance, five lens presets (`linear`, `dewarp`, `ultra`, `mega`, `tinyPlanet`) and `clampView`.
- `viewAt`: the view along a keyframed path, smooth through the keyframes without overshooting.
- `createViewer`: looks around in a `<video>` on a WebGPU canvas, also from the lighter
  `@bvdmitri/web360/view` entry.
- `createReframer`: turns decoded 360 frames into flat views of them, for exporting a reframed
  video.

## [0.5.1] - 2026-10-20

### Changed

- Built with TypeScript 6, and the development tools updated (prettier, eslint plugins, fast-check,
  the setup-node action).

## [0.5.0] - 2026-10-20

### Added

- A documentation site, https://bvdmitri.github.io/web360/: a getting-started guide, examples
  (rendering to MP4, a preview frame, split recordings, progress and cancelling, errors, a Web
  Worker), the options and errors, the supported cameras, the file formats, the design decisions,
  the roadmap and an API reference generated from the package's exports.
- `RandomAccessSource`, the type `blobSource` returns, is exported.
- Every version is released from one tag: npm (with provenance) and its GitHub Release together.

## [0.4.3] - 2026-10-20

### Changed

- The `smoothing` option takes a plain number of seconds.
- The package ships its MIT licence, and its README documents the `platform` option.
- Documentation describes the library as it is: the cameras it reads, what is measured and what is
  provisional, and the Insta360 file format.

## [0.4.2] - 2026-10-20

### Changed

- GoPro MAX2 and MAX recordings are steadier: they are stabilized by the camera's 800 Hz gyro,
  levelled by the gravity it records, with the gyro's measured clock, instead of the once-a-frame
  attitude a frame late.

## [0.4.1] - 2026-10-20

### Fixed

- Stitching works in a browser that cannot hand decoded video frames to WebGPU (headless Linux
  Chromium on SwiftShader, as CI runs it): web360 checks once per page and copies the frames on the
  CPU there, instead of losing the GPU device on the first frame.

## [0.4.0] - 2026-10-20

### Added

- GoPro MAX2 and MAX recordings (`.360`): `openRendition` opens one, its later chapters passed as
  `following` and joined into one recording, and renders its in-camera cube map on the GPU.
- A GoPro is stabilized by the attitude the camera records, levelled by its own gravity reading;
  its alignment and telemetry delay are measured on MAX2 footage.

## [0.3.0] - 2026-10-20

### Fixed

- No ribbon or dark line along the seam: each lens is used only inside its clean image circle, and
  the lenses hand over with a smooth blend instead of a linear ramp.
- The seam colour correction now works across clouds and ground as well as clear sky, comparing
  patch averages so texture no longer makes it give up.

## [0.2.0] - 2026-10-20

### Changed

- Stabilization is steadier: the attitude follows the gyro exactly and takes the vertical from the
  accelerometer averaged over seconds, instead of chasing it frame by frame (about ten times less
  added motion in freefall).
- The ONE R's rim falloff is measured once from footage instead of estimated per frame, which removes
  the bright arc that showed along the seam in the sky.

### Added

- A colour field around the seam meets the two lenses where one of them sees glare from the sun,
  re-measured as the video goes and eased in like the exposure gains.

## [0.1.0] - 2026-10-19

### Added

- `openRendition`: stitch and stabilize an Insta360 recording (`.insv`, one file or a split
  `_00_`/`_10_` pair) in the browser into equirectangular `VideoFrame`s, on WebGPU and WebCodecs.
- Stabilization modes `smooth` (the default), `lock`, `horizon`, `follow` and `off`, from the
  camera's fused gyro and accelerometer.
- Rolling-shutter correction, and lens exposure and vignetting matched across the seam.
- `Web360Error` codes for what stops a rendition: no WebGPU, no WebCodecs, an unsupported codec, a
  missing lens file, an unreadable recording, a decode failure.

[0.6.1]: https://github.com/bvdmitri/web360/releases/tag/v0.6.1
[0.6.0]: https://github.com/bvdmitri/web360/releases/tag/v0.6.0
[0.5.1]: https://github.com/bvdmitri/web360/releases/tag/v0.5.1
[0.5.0]: https://github.com/bvdmitri/web360/releases/tag/v0.5.0
[0.4.3]: https://github.com/bvdmitri/web360/releases/tag/v0.4.3
[0.4.2]: https://github.com/bvdmitri/web360/releases/tag/v0.4.2
[0.4.1]: https://github.com/bvdmitri/web360/releases/tag/v0.4.1
[0.4.0]: https://github.com/bvdmitri/web360/releases/tag/v0.4.0
[0.3.0]: https://github.com/bvdmitri/web360/releases/tag/v0.3.0
[0.2.0]: https://github.com/bvdmitri/web360/releases/tag/v0.2.0
[0.1.0]: https://github.com/bvdmitri/web360/releases/tag/v0.1.0
