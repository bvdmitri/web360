# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
