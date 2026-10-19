# omnisphere

Functions to read, analyse, stitch, stabilize and process 360 video in the browser.

omnisphere turns a camera's raw 360 recording into data and pictures you can work with: it reads
the recording's telemetry and calibration, computes the camera's motion, stitches the lenses into
an equirectangular frame, and measures what it did. It is a set of functions, not a player:
playback, clocks, audio sync and controls belong to the application that uses it.

**Status:** early development, not yet published.

## Planned scope

- **Open** a recording from Insta360 (`.insv`), GoPro (`.360`) and DJI (`.osv`) cameras into one
  vendor-neutral model: video tracks, lens optics, motion samples, frame timing, rolling shutter.
- **Process** frames on demand (one stitched or reprojected frame for a given time or orientation)
  or in batches for an encoder.
- **Stabilize** with a choice of modes, including horizon levelling and smoothed heading.
- **Analyse** stabilization quality, motion and seams.

A camera body is supported once its format is described in `docs/` and covered by a test fixture.

## Development

Requires Node 24 or 26 and pnpm 11. Clone with Git LFS installed.

```sh
pnpm install
pnpm verify   # checks, typecheck, lint, format, dependency rules, tests with coverage
```

See [CLAUDE.md](./CLAUDE.md) for the rules every change follows, and
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the layout.

## License

MIT
