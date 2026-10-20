import type { LensImage, LensOptics } from '../model/recording';
import { estimateGains } from './gains';
import type { Grid } from './overlap';
import type { LensSampler, Rgb } from './render';
import { estimateSeamColour, type SeamColour } from './seamColour';
import { devignette } from './vignetting';

const CHANNELS = 4;
const BYTE = 255;
const BLACK: Rgb = [0, 0, 0];
const UNITY: Rgb = [1, 1, 1];
const GRID: Grid = { width: 256, height: 128 };

/** A decoded lens picture as RGBA bytes, row-major, at any size (usually a small copy of a frame). */
export interface LensPicture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
}

/** The lenses to correct, where each one's image is, and a picture of each video. */
export interface ColourInput {
  readonly lenses: readonly LensOptics[];
  readonly images: readonly LensImage[];
  readonly pictures: readonly LensPicture[];
}

/**
 * What the stitch applies to the lens colours on top of each lens's own falloff: its gain, and the
 * colour field that meets the lenses around the seam.
 */
export interface ColourCorrection {
  readonly gains: readonly Rgb[];
  readonly seam: SeamColour;
}

/**
 * Reads a lens picture at calibration-canvas pixels, through the lens's image placement.
 *
 * @remarks The picture covers the image's rectangle of the canvas at whatever size it was copied
 * at, so a canvas pixel is scaled into it and read from the nearest pixel; outside the rectangle it
 * reads black. It is for estimating corrections on a small copy, not for rendering.
 */
export function imageSampler(picture: LensPicture, image: LensImage): LensSampler {
  const scaleX = picture.width / image.extent[0];
  const scaleY = picture.height / image.extent[1];
  return (pixel) => {
    const x = Math.round((pixel[0] - image.origin[0]) * scaleX);
    const y = Math.round((pixel[1] - image.origin[1]) * scaleY);
    if (x < 0 || y < 0 || x >= picture.width || y >= picture.height) return BLACK;
    const at = (y * picture.width + x) * CHANNELS;
    const { rgba } = picture;
    return [(rgba[at] ?? 0) / BYTE, (rgba[at + 1] ?? 0) / BYTE, (rgba[at + 2] ?? 0) / BYTE];
  };
}

/**
 * Estimates the colour corrections of one frame from a picture of each video.
 *
 * @remarks Each lens is flattened by its own measured falloff (ADR 0017), then its gain is matched
 * across the overlap on the flattened lenses (ADR 0008), and what difference is left is measured
 * around the seam (ADR 0018), as the reference stitch applies them. `pictures`
 * follows the videos (`LensImage.texture`), so the lenses of a single-video camera share one.
 */
export function estimateColour(input: ColourInput): ColourCorrection {
  const samplers = input.lenses.map((...[, index]) => {
    const image = input.images[index];
    const picture = image === undefined ? undefined : input.pictures[image.texture];
    return image === undefined || picture === undefined
      ? (): Rgb => BLACK
      : imageSampler(picture, image);
  });
  const flattened = devignette(input.lenses, samplers);
  const gains = estimateGains(input.lenses, flattened, GRID);
  const matched = flattened.map((sampler, lens): LensSampler => {
    const gain = gains[lens] ?? UNITY;
    return (pixel) => {
      const [r, g, b] = sampler(pixel);
      return [r * gain[0], g * gain[1], b * gain[2]];
    };
  });
  return { gains, seam: estimateSeamColour(input.lenses, matched) };
}
