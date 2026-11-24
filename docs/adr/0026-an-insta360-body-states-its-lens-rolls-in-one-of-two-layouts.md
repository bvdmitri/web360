# ADR 0026: An Insta360 body states its lens rolls in one of two layouts

Status: accepted (2026-11-24), the X5 values measured on X5 footage; amends ADR 0007 and ADR 0010

## Context

ADR 0007 reads each lens's v1 roll as a rotation about `y` that also sets the way the lens faces:
the ONE R states -179.1 and 0.46 degrees, which face its two lenses apart. The X5 states 90.631 and
89.538 degrees. Read the same way, both of its optical axes point along `+x`, so the stitch painted
both lenses onto one hemisphere and left the other black. Nothing in the v1 string names its
layout, and the X5's calibration version word (1137) differs from the ONE R's (3105) in a way no
fixture explains.

The X5's IMU alignment (ADR 0010) is also a per-body fact. With the ONE R's alignment, a
horizon-levelled X5 view tilts badly under canopy.

## Decision

- **Two layouts, recognised from the rolls** (`format/insta360/facing.ts`). If the two rolls are
  within 30 degrees of a half turn apart, they are the half-turn layout (the ONE R) and are kept as
  stated. If both are within 30 degrees of a quarter turn, they are the quarter-turn layout (the
  X5): lens 0 is turned a quarter turn further and lens 1 a quarter turn back, so lens 0 faces back
  near 180 degrees and lens 1 faces front near 0, as on the ONE R. A calibration that fits neither
  layout, or that does not have two lenses, is refused with `UnsupportedCalibrationError`. It is
  never stitched with both lenses on one hemisphere.
- **The X5 reading is measured.** On four X5 freefall frames, scored by `stitch/seamCorrelation`
  (ADR 0009), this reading beats every other one: the tracks swapped, the second lens turned 90,
  180 or 270 degrees about its axis, and the deviation from the quarter turn taken with the
  opposite sign. It is also best, within 0.006, against a swept extra roll of the second lens. Its
  correlation is 0.61 to 0.71. The best wrong turn scores at most 0.41, and the swapped tracks score 0.
- **The X5's IMU sits a further quarter turn about `z`** from the ONE R's: IMU `x` along the lens
  frame's `y`, IMU `z` along its `-x`. It is selected by the model string. On X5 footage, of the 24
  axis-aligned candidates (`WEB360_PREVIEW_IMU_SEARCH`), it keeps a locked view stillest on average
  across nine moments of a jump (mean 0.75; the next best is 0.62). It levels the horizon under
  canopy, where the ONE R's alignment ranks between 4th and 12th. Every other body takes the ONE R's
  alignment, provisionally.

## Consequences

- A body that states a third layout fails loudly instead of stitching wrongly. Supporting it means
  measuring it and adding it here.
- The X5's mapping angle, coverage, vignetting and rolling-shutter order remain the ONE R's values,
  provisionally. A field-of-view sweep on X5 freefall frames does not peak at 183 degrees: the score
  keeps rising to between 188 and 192 degrees, without a consistent peak. It needs its own
  measurement before the value changes.
- The X3 and X4 likely share the X5's layout. They open in whichever layout their rolls fit, with
  the ONE R's IMU alignment, until their own footage sets them.
