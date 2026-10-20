# ADR 0019: The seam blends inside the clean image circle

Status: accepted (2026-10-20)

## Context

With ADR 0017 and 0018 in place, ONE R footage of a bright sky shows a ribbon along the seam: a
band of different blue between two crisp edges, one of them a thin dark line, seen on two
recordings. It has three causes:

- **The lens's dark border.** With coverage out to a reach of 1.027, at some azimuths the
  illuminated circle's dark border lies inside the coverage, and, boosted by the falloff
  correction, it draws a line along the overlap's edge.
- **A kink in the blend.** With each lens's weight rising linearly from zero at its coverage edge,
  where the lenses' colours differ the slope of the blend jumps there, and the eye reads that as an
  edge.
- **Untrusted cloud patches.** A seam colour field that rejects a patch whose sample-by-sample
  differences disagree rejects every textured patch once the lenses register a pixel apart, so
  across clouds it falls back to its neighbours in the sky, and a warm-against-cool step stays.

## Decision

- **The ONE R's coverage is 185 degrees** (a reach of about 1.011), inside the dark border.
- **Each lens's margin is eased in with a smoothstep** over the overlap's width (the coverage
  beyond a hemisphere) before the weights are normalised, in the reference stitch and the shader
  alike: two opposite lenses still share the seam evenly, and a lens starts to count with zero
  slope.
- **The seam field compares patch averages**, so texture cancels, and distrusts a patch only when
  its colour spreads very differently in the two lenses (something in one lens and not the other).

## Consequences

- On both recordings the stitch shows no ribbon and no dark line, and the warm-against-cool step
  across clouds becomes a smooth transition; what remains in a sun-facing sky is a soft change of
  shade.
- The overlap is 5 degrees wide (against 8 at a reach of 1.027), so the seam field carries more of
  the colour matching; the blend itself stays smooth.
