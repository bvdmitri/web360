# web360

Stitch and stabilize raw 360 recordings in the browser, on WebGPU and WebCodecs.

web360 is published on npm as [`@bvdmitri/web360`](https://www.npmjs.com/package/@bvdmitri/web360).
It is a library, not a player: playback, clocks, audio sync and controls belong to the application
that uses it.

## What it does

- **Opens a recording** from the files a user picked, reading only its headers, telemetry and
  calibration, never the whole file into memory.
- **Stitches** an Insta360's two fisheye lenses into an equirectangular frame, matching their
  exposure and colour across the seam and correcting rolling shutter, or **renders** a GoPro's
  equi-angular cube map, which the camera stitched itself.
- **Stabilizes** from the camera's gyro, levelled by its accelerometer or its own gravity reading,
  with a choice of modes: `smooth`, `lock`, `horizon`, `follow` or `off`.
- **Yields `VideoFrame`s** for a span of the recording, for the application to encode.

See [packages/web360/README.md](./packages/web360/README.md) for usage, options and errors.

## Cameras

- **Insta360 ONE R (5.7K 360 lens)**, `.insv`, a single file or a split `_00_`/`_10_` pair:
  measured on ONE R footage and covered by a fixture
  ([docs/FORMAT-insta360.md](./docs/FORMAT-insta360.md)).
- **Other Insta360 bodies**: open and stitch with the ONE R's values, which are provisional for
  them.
- **GoPro MAX2**, `.360`, chapters joined: measured on MAX2 footage
  ([docs/FORMAT-gopro.md](./docs/FORMAT-gopro.md)).
- **GoPro MAX**: opens with the MAX2's values; provisional, with no fixture.
- **DJI Osmo 360** (`.osv`): planned, not started.

A camera body is supported once its format is described in `docs/` and covered by a test fixture.
The ONE R and the MAX2 are; the original MAX has no fixture and is provisional, as are the other
Insta360 bodies. See [PLAN.md](./PLAN.md) for what is next.

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
