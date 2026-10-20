# ADR 0019: The seam blends inside the clean image circle

Status: accepted (2026-10-20)

## Context

After ADR 0017 and 0018, the owner saw a ribbon along the seam in the sky right after exit: a band
of different blue between two crisp edges, one of them a thin dark line. Reproduced on the second
recording at 74 seconds (and found on the first at other moments), it had three causes:

- **The lens's dark border.** Coverage reached a reach of 1.027; at some azimuths the illuminated
  circle's dark border begins before that, and, boosted by the falloff correction, it was drawn as a
  line along the overlap's edge.
- **A kink in the blend.** Each lens's weight rose linearly from zero at its coverage edge, so where
  the lenses' colours differ the slope of the blend jumps there, and the eye reads that as an edge.
- **Untrusted cloud patches.** The seam colour field rejected a patch whose sample-by-sample
  differences disagreed, which every textured patch does once the lenses register a pixel apart, so
  across clouds it fell back to its neighbours in the sky, and a warm-against-cool step stayed.

## Decision

- **The ONE R's coverage is 185 degrees** (a reach of about 1.011), inside the dark border.
- **Each lens's margin is eased in with a smoothstep** over the overlap's width (the coverage
  beyond a hemisphere) before the weights are normalised, in the reference stitch and the shader
  alike: two opposite lenses still share the seam evenly, and a lens starts to count with zero slope.
- **The seam field compares patch averages**, so texture cancels, and distrusts a patch only when
  its colour spreads very differently in the two lenses (something in one lens and not the other).

## Consequences

- On both recordings the ribbon and its dark line are gone, and the warm-against-cool step across
  clouds becomes a smooth transition; what remains in a sun-facing sky is a soft change of shade.
- The overlap is narrower (5 degrees instead of 8), so the seam field carries more of the colour
  matching; the blend itself stays smooth.
