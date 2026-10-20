# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
