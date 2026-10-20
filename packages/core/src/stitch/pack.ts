import type { LensImage, LensOptics, Vignetting } from '../model/recording';
import { lensPose } from '../optics/lens';
import { conjugate, type Quaternion } from '../shared/math/quaternion';
import { degreesToRadians } from '../shared/units/units';
import type { Rgb } from './render';
import type { Shutter } from './sample';

const SLOT = 4;
const UNITY: Rgb = [1, 1, 1];
const NONE: Vignetting = { strength: 0, start: 0 };

/** A lens to stitch: its optics and where its image is. */
export interface StitchLens {
  readonly optics: LensOptics;
  readonly image: LensImage;
}

/**
 * A rolling-shutter correction tabulated for a renderer: the turn sampled at `steps` rows evenly
 * spaced from row 0 to `rows` (canvas pixels), to be interpolated between.
 */
export interface ShutterTable {
  readonly sample: Shutter;
  readonly rows: number;
  readonly steps: number;
}

/**
 * One stitched frame as a renderer receives it: the {@link Scene} of the reference stitch, with
 * each lens's image placement and the shutter tabulated.
 */
export interface StitchFrame {
  readonly lenses: readonly StitchLens[];
  readonly correction: Quaternion;
  readonly width: number;
  readonly height: number;
  readonly gains?: readonly Rgb[];
  readonly shutter?: ShutterTable;
}

/**
 * The packed layout in four-float slots: a header, a fixed run of slots per lens, then the shutter
 * table.
 *
 * @remarks Header slot 0 is the correction quaternion; slot 1 is the output width and height, the
 * lens count and the shutter steps (0 for none). Each lens then has, in order: the inverse lens
 * pose; centre x and y, focal length and radius; half field of view, half coverage, texture index
 * and shutter rows; the image origin and extent; the red, green and blue gain and the vignetting
 * strength; and the vignetting start squared. After the lenses come `steps` turn quaternions per
 * lens, lens by lens. Quaternions are stored `x, y, z, w`.
 */
export const STITCH_LAYOUT = { header: 2, lensSlots: 6 } as const;

/**
 * Packs one frame of the stitch into the floats a GPU renderer reads, laid out as
 * {@link STITCH_LAYOUT} describes.
 *
 * @remarks This is the contract between the reference stitch and a shader: it carries the same
 * optics, correction, gains, vignetting and shutter, reduced to numbers a shader can apply without
 * the core. Angles are in radians and the focal length is the equidistant `radius / (fieldOfView /
 * 2)`, so the shader projects a direction as the optics do. The shutter is sampled at each lens's
 * centre column, which suits a sensor read row by row; between tabulated rows a renderer
 * interpolates. A lens without a gain is left as recorded, and its vignetting is its optics' own
 * (none when it states none).
 */
export function packStitch(frame: StitchFrame): Float32Array<ArrayBuffer> {
  const steps = frame.shutter?.steps ?? 0;
  const lensCount = frame.lenses.length;
  const slots = STITCH_LAYOUT.header + lensCount * (STITCH_LAYOUT.lensSlots + steps);
  const packed = new Float32Array(slots * SLOT);
  packed.set(quaternionSlot(frame.correction), 0);
  packed.set([frame.width, frame.height, lensCount, steps], SLOT);
  for (const [index, lens] of frame.lenses.entries()) {
    const at = (STITCH_LAYOUT.header + index * STITCH_LAYOUT.lensSlots) * SLOT;
    packed.set(lensSlots({ frame, lens, index }), at);
  }
  const table = (STITCH_LAYOUT.header + lensCount * STITCH_LAYOUT.lensSlots) * SLOT;
  packed.set(shutterSlots(frame), table);
  return packed;
}

function lensSlots(entry: {
  readonly frame: StitchFrame;
  readonly lens: StitchLens;
  readonly index: number;
}): number[] {
  const { optics, image } = entry.lens;
  const halfField = degreesToRadians(optics.fieldOfView) / 2;
  return [
    ...quaternionSlot(conjugate(lensPose(optics.orientation))),
    optics.center[0],
    optics.center[1],
    optics.radius / halfField,
    optics.radius,
    halfField,
    degreesToRadians(optics.coverage) / 2,
    image.texture,
    entry.frame.shutter?.rows ?? 0,
    ...image.origin,
    ...image.extent,
    ...colourSlots(entry.frame, { index: entry.index, vignetting: optics.vignetting ?? NONE }),
  ];
}

function colourSlots(
  frame: StitchFrame,
  lens: { readonly index: number; readonly vignetting: Vignetting },
): number[] {
  const gain = frame.gains?.[lens.index] ?? UNITY;
  const { vignetting } = lens;
  return [...gain, vignetting.strength, vignetting.start * vignetting.start, 0, 0, 0];
}

function shutterSlots(frame: StitchFrame): number[] {
  const table = frame.shutter;
  if (table === undefined) return [];
  const last = Math.max(1, table.steps - 1);
  return frame.lenses.flatMap((lens, index) =>
    Array.from({ length: table.steps }, (...[, step]) =>
      quaternionSlot(table.sample(index, [lens.optics.center[0], (step / last) * table.rows])),
    ).flat(),
  );
}

function quaternionSlot(q: Quaternion): [number, number, number, number] {
  return [q.x, q.y, q.z, q.w];
}
