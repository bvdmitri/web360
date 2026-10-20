# Cameras

Each camera body web360 reads is described in a format document and covered by a test fixture.
A body of a known format that has not been measured opens with its family's measured values,
marked provisional here, until its own footage sets them.

| Camera                    | File                                      | Status                                     |
| ------------------------- | ----------------------------------------- | ------------------------------------------ |
| Insta360 ONE R (5.7K 360) | `.insv`, one file or a `_00_`/`_10_` pair | Measured on ONE R footage, with a fixture  |
| Other Insta360 bodies     | `.insv`                                   | Provisional: the ONE R's values            |
| GoPro MAX2                | `.360`, chapters joined                   | Measured on MAX2 footage, with a fixture   |
| GoPro MAX                 | `.360`, chapters joined                   | Provisional: the MAX2's values, no fixture |
| DJI Osmo 360              | `.osv`                                    | Planned                                    |

What each file holds and how web360 reads it: [Insta360](../FORMAT-insta360.md),
[GoPro](../FORMAT-gopro.md), and the [ISO base media container](../FORMAT-iso-bmff.md) both use.
What comes next is on the [roadmap](../roadmap.md).

A GoPro's 8K video needs a browser that decodes HEVC at that size.
