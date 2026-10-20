# ADR 0025: A view path is a monotone cubic through its keyframes

Status: accepted (2026-10-20)

## Context

A flat video exported from a 360 one follows a path of views: the keyframes a person sets at a few
moments, and a smooth move between them. A straight line between keyframes starts and stops with a
jolt at each one. A Catmull-Rom spline moves through them smoothly but overshoots: between a field
of view of 80 and one of 120 it can swing past 120, and between two equal tilts it can dip below
both.

## Decision

- **Each part of the view** (pan, tilt, roll, field of view, distance) follows its own monotone
  cubic curve through the keyframes, a Fritsch-Carlson piecewise cubic Hermite
  (`packages/core/src/view/path.ts`, `viewAt`).
- **Its tangents** are zero at the first and last keyframe, so the path eases out of the first
  and into the last. A keyframe where the path turns back, or holds still, also gets a zero
  tangent. At any other keyframe the tangent is the weighted harmonic mean of the slopes on either
  side, so the path keeps moving through it.
- **The pan** turns the short way round: each keyframe's pan is moved by whole turns to within
  half a turn of the one before before the curve is fitted, and the result is wrapped.
- **Before the first keyframe and after the last**, the path holds them. Keyframes may come in any
  order. Two at the same time keep the later one given, and an empty path is a `RangeError`.

## Consequences

- Between two keyframes every part stays within their two values, so no part leaves its limits
  and a path never shows a view nobody set.
- The parts move independently, as editors' keyframes do. A path through a pole (a tilt of plus or
  minus 90) can turn about it faster than a rotation-space spline would.
- A keyframe with no pan change on either side holds still at it; one in the middle of a steady
  turn does not.
