# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-19

### Added

- `openRendition`: stitch and stabilize an Insta360 recording (`.insv`, one file or a split
  `_00_`/`_10_` pair) in the browser into equirectangular `VideoFrame`s, on WebGPU and WebCodecs.
- Stabilization modes `smooth` (the default), `lock`, `horizon`, `follow` and `off`, from the
  camera's fused gyro and accelerometer.
- Rolling-shutter correction, and lens exposure and vignetting matched across the seam.
- `Web360Error` codes for what stops a rendition: no WebGPU, no WebCodecs, an unsupported codec, a
  missing lens file, an unreadable recording, a decode failure.
