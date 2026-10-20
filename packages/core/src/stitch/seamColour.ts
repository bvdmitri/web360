import type { LensOptics } from '../model/recording';
import { lensPose, project } from '../optics/lens';
import { conjugate, rotate, type Vector3 } from '../shared/math/quaternion';
import type { LensSampler, Rgb } from './sampler';

/** How many directions around the seam the field holds. */
export const SEAM_BINS = 32;

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const DEGREES_PER_HALF_TURN = 180;
const DEGREE = Math.PI / DEGREES_PER_HALF_TURN;
// The correction reaches 45 degrees either side of the seam.
const DEFAULT_WIDTH_DEGREES = 45;
const DEFAULT_WIDTH = DEFAULT_WIDTH_DEGREES * DEGREE;
// A patch: four azimuths across a direction's share of the ring, by offsets of whole degrees out to
// two either side of the seam.
const PATCH_AZIMUTHS = 4;
const PATCH_REACH_DEGREES = 2;
const PATCH_OFFSETS = Array.from(
  { length: 2 * PATCH_REACH_DEGREES + 1 },
  (...[, index]) => (index - PATCH_REACH_DEGREES) * DEGREE,
);
const MIN_SAMPLES = 8;
const MISMATCH = 0.06;
const SATURATED = 0.98;
const DARK = 0.02;
const LIMIT = 0.4;
const CHANNELS = 3;
const NEIGHBOUR_SHARE = 0.25;
const SMOOTHING = [NEIGHBOUR_SHARE, 1 - 2 * NEIGHBOUR_SHARE, NEIGHBOUR_SHARE] as const;
const NONE: Rgb = [0, 0, 0];

/**
 * A colour correction that varies around the seam: for each of {@link SEAM_BINS} directions, what
 * the second lens records there on top of the first, and how far either side of the seam the
 * correction reaches (`width`, radians).
 *
 * @remarks The difference is additive, per channel, in the lenses' sample values: the glare a
 * sun-facing lens adds to its sky is a haze of about the same amount in every channel, which a gain
 * cannot follow. The directions run around the seam by their azimuth in the first lens's frame,
 * from `-pi`, bin `i` centred at `-pi + (i + 1/2) * 2pi / SEAM_BINS`.
 */
export interface SeamColour {
  readonly offsets: readonly Rgb[];
  readonly width: number;
}

/**
 * Where a camera-frame direction sits relative to the seam of a two-lens camera: its azimuth around
 * the seam (in the first lens's frame) and its angular offset from the seam, positive toward the
 * second lens.
 *
 * @remarks The offset is half the difference of the direction's angles from the two optical axes,
 * so it is zero where the lenses see the direction equally far out and, for opposite lenses, the
 * angle from the seam's plane. A camera with other than two lenses has no seam, and every direction
 * is infinitely far from it.
 */
export function seamPosition(
  lenses: readonly LensOptics[],
  direction: Vector3,
): { readonly azimuth: number; readonly offset: number } {
  const [first, second] = lenses;
  if (first === undefined || second === undefined || lenses.length !== 2) {
    return { azimuth: 0, offset: Infinity };
  }
  const inFirst = rotate(conjugate(lensPose(first.orientation)), direction);
  const offset = (project(first, direction).angle - project(second, direction).angle) / 2;
  return { azimuth: Math.atan2(inFirst[1], inFirst[0]), offset };
}

/**
 * What to add to a lens's colour at a seam position: each lens moved halfway toward the other at the
 * seam, the share fading as `cos^2` to nothing at `width` either side.
 */
export function seamShift(
  seam: SeamColour,
  at: {
    readonly position: { readonly azimuth: number; readonly offset: number };
    readonly lens: number;
  },
): Rgb {
  const { offset, azimuth } = at.position;
  if (at.lens > 1 || !(Math.abs(offset) < seam.width)) return NONE;
  const fade = Math.cos((HALF_PI * offset) / seam.width) ** 2;
  const share = (at.lens === 0 ? 1 : -1) * (fade / 2);
  const difference = around(seam.offsets, azimuth);
  return [difference[0] * share, difference[1] * share, difference[2] * share];
}

/**
 * Measures how the second lens's colour differs from the first's around the seam, from samplers
 * already flattened and matched in gain.
 *
 * @remarks For each direction a patch across the overlap is sampled in both lenses (four azimuths
 * by five offsets within two degrees of the seam), saturated and black samples left out, and the
 * difference is that of the patch's average colours, so texture registered a pixel apart cancels.
 * Where the patch's colour varies very differently in the two lenses, they are seeing different
 * things there (a jumper or a helmet on the seam, through parallax) and the direction is not
 * trusted; its value is
 * filled in from the trusted ones either side. The result is smoothed around the ring and limited,
 * so one bad patch cannot paint the sky. A camera with other than two lenses gets no correction.
 */
export function estimateSeamColour(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
): SeamColour {
  if (lenses.length !== 2)
    return { offsets: Array.from({ length: SEAM_BINS }, () => NONE), width: DEFAULT_WIDTH };
  const measured = Array.from({ length: SEAM_BINS }, (...[, bin]) =>
    measureBin(lenses, samplers, bin),
  );
  return { offsets: smoothRing(fillRing(measured)), width: DEFAULT_WIDTH };
}

function measureBin(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  bin: number,
): Rgb | undefined {
  const pairs: Pair[] = [];
  for (let step = 0; step < PATCH_AZIMUTHS; step += 1) {
    const azimuth = -Math.PI + ((bin + (step + 1 / 2) / PATCH_AZIMUTHS) * TAU) / SEAM_BINS;
    for (const offset of PATCH_OFFSETS) {
      const pair = pairAt(lenses, samplers, { azimuth, offset });
      if (pair !== undefined) pairs.push(pair);
    }
  }
  return trusted(pairs);
}

interface Pair {
  readonly first: Rgb;
  readonly second: Rgb;
}

function pairAt(
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  at: { readonly azimuth: number; readonly offset: number },
): Pair | undefined {
  const [first, second] = lenses;
  if (first === undefined || second === undefined) return undefined;
  const direction = seamDirection(first, at);
  const [colourA, colourB] = [first, second].map((lens, index) => {
    const landed = project(lens, direction);
    const colour = landed.covered ? samplers[index]?.(landed.pixel) : undefined;
    return colour !== undefined && isUsable(colour) ? colour : undefined;
  });
  return colourA === undefined || colourB === undefined
    ? undefined
    : { first: colourA, second: colourB };
}

// The camera-frame direction at an azimuth around the seam and an offset from it, in the first
// lens's frame.
function seamDirection(
  first: LensOptics,
  at: { readonly azimuth: number; readonly offset: number },
): Vector3 {
  const polar = HALF_PI + at.offset;
  const inFirst: Vector3 = [
    Math.sin(polar) * Math.cos(at.azimuth),
    Math.sin(polar) * Math.sin(at.azimuth),
    Math.cos(polar),
  ];
  return rotate(lensPose(first.orientation), inFirst);
}

function isUsable(colour: Rgb): boolean {
  const brightest = Math.max(...colour);
  return brightest < SATURATED && brightest > DARK;
}

// The patch's colour in the second lens over the first, compared as averages so that texture the
// lenses register a pixel apart cancels out; a patch whose colour varies very differently in
// the two lenses holds different things in them (a jumper or a helmet in one) and is not trusted.
function trusted(pairs: readonly Pair[]): Rgb | undefined {
  if (pairs.length < MIN_SAMPLES) return undefined;
  const first = pairs.map((pair) => pair.first);
  const second = pairs.map((pair) => pair.second);
  if (Math.abs(spreadOf(first) - spreadOf(second)) > MISMATCH) return undefined;
  const [a, b] = [averageOf(first), averageOf(second)];
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

// How much a patch's colour varies, over the three channels.
function spreadOf(colours: readonly Rgb[]): number {
  const mean = averageOf(colours);
  let variance = 0;
  for (const colour of colours) {
    variance +=
      (colour[0] - mean[0]) ** 2 + (colour[1] - mean[1]) ** 2 + (colour[2] - mean[2]) ** 2;
  }
  return Math.sqrt(variance / (CHANNELS * colours.length));
}

function averageOf(colours: readonly Rgb[]): Rgb {
  const sum: [number, number, number] = [0, 0, 0];
  for (const colour of colours) {
    sum[0] += colour[0] / colours.length;
    sum[1] += colour[1] / colours.length;
    sum[2] += colour[2] / colours.length;
  }
  return sum;
}

// Untrusted directions take the value between their nearest trusted neighbours around the ring.
function fillRing(measured: readonly (Rgb | undefined)[]): Rgb[] {
  const known = measured.flatMap((value, bin) => (value === undefined ? [] : [{ bin, value }]));
  const [first] = known;
  const last = known.at(-1);
  return first === undefined || last === undefined
    ? measured.map(() => NONE)
    : measured.map((value, bin) => value ?? between({ known, first, last }, bin));
}

interface Known {
  readonly bin: number;
  readonly value: Rgb;
}

function between(
  ring: { readonly known: readonly Known[]; readonly first: Known; readonly last: Known },
  bin: number,
): Rgb {
  const after = ring.known.find((one) => one.bin > bin) ?? ring.first;
  const before = ring.known.findLast((one) => one.bin < bin) ?? ring.last;
  const span = (after.bin - before.bin + SEAM_BINS) % SEAM_BINS || SEAM_BINS;
  const t = ((bin - before.bin + SEAM_BINS) % SEAM_BINS) / span;
  return [0, 1, 2].map(
    (channel) => (before.value[channel] ?? 0) * (1 - t) + (after.value[channel] ?? 0) * t,
  ) as unknown as Rgb;
}

function smoothRing(values: readonly Rgb[]): Rgb[] {
  return values.map((...[, bin]) => {
    const sum: [number, number, number] = [0, 0, 0];
    for (const [step, weight] of SMOOTHING.entries()) {
      const neighbour = values[(bin + step - 1 + SEAM_BINS) % SEAM_BINS] ?? NONE;
      sum[0] += neighbour[0] * weight;
      sum[1] += neighbour[1] * weight;
      sum[2] += neighbour[2] * weight;
    }
    return sum.map((value) => Math.max(-LIMIT, Math.min(LIMIT, value))) as unknown as Rgb;
  });
}

// The field at an azimuth, linear between bin centres and wrapping around the ring.
function around(offsets: readonly Rgb[], azimuth: number): Rgb {
  const count = offsets.length;
  if (count === 0) return NONE;
  const position = (((azimuth + Math.PI) / TAU) * count - 1 / 2 + count) % count;
  const lower = Math.floor(position);
  const t = position - lower;
  const a = offsets[lower % count] ?? NONE;
  const b = offsets[(lower + 1) % count] ?? NONE;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
