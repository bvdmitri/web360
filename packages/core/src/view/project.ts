import type { TextureSampler } from '../stitch/cubeRender';
import { toCoordinates } from '../stitch/equirectangular';
import type { Rgb } from '../stitch/sampler';
import { rotate, type Vector3 } from '../shared/math/quaternion';
import { degreesToRadians } from '../shared/units/units';
import { viewRotation, type View } from './view';

const PIXEL_CENTRE = 0.5;
const HALF = 0.5;

/**
 * The unit direction a pixel of a view's picture looks along, in the equirectangular frame.
 *
 * @remarks `point` is the pixel in normalized picture coordinates, `[0, 1]` left to right and top
 * to bottom, and `aspect` the picture's width over its height. The ray leaves a virtual camera
 * `view.distance` behind the sphere's centre, through an image plane that spans `view.fov` across
 * the longer side, and the direction is where it meets the unit sphere, turned by the view's
 * rotation (ADR 0024). This is the reference the view shader follows.
 */
export function viewDirection(
  view: View,
  point: readonly [number, number],
  aspect: number,
): Vector3 {
  const [scaleX, scaleY] = lensScale(view, aspect);
  const x = 2 * point[0] - 1;
  const y = 1 - 2 * point[1];
  const ray = unit([1, -x * scaleX, y * scaleY]);
  return rotate(viewRotation(view), onSphere(ray, view.distance));
}

/** A view frame to render on the CPU: the view, the equirectangular frame's sampler and sizes. */
export interface ViewScene {
  readonly view: View;
  readonly sampler: TextureSampler;
  readonly source: { readonly width: number; readonly height: number };
  readonly width: number;
  readonly height: number;
}

/**
 * Renders a view of an equirectangular frame on the CPU, row-major.
 *
 * @remarks The reference for the view shader: each output pixel's centre looks along
 * {@link viewDirection}, and the frame is read at that direction's equirectangular pixel. The
 * sampler wraps across the frame's left and right edges, as the GPU's repeating sampler does.
 */
export function renderView(scene: ViewScene): Rgb[] {
  const { width, height, source } = scene;
  const pixels: Rgb[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = [(x + PIXEL_CENTRE) / width, (y + PIXEL_CENTRE) / height] as const;
      const [u, v] = toCoordinates(viewDirection(scene.view, point, width / height));
      pixels.push(scene.sampler([u * source.width, v * source.height]));
    }
  }
  return pixels;
}

/**
 * The packed view a GPU renderer reads: three four-float slots.
 *
 * @remarks Slot 0 is the view's rotation quaternion (`x, y, z, w`); slot 1 is the lens scale across
 * and down the picture (the image plane's half-width and half-height at unit distance) and the
 * distance, then a zero; slot 2 is the picture's width and height, then two zeros. The shader
 * rebuilds {@link viewDirection} from these.
 */
export function packView(
  view: View,
  size: { readonly width: number; readonly height: number },
): Float32Array<ArrayBuffer> {
  const q = viewRotation(view);
  const [scaleX, scaleY] = lensScale(view, size.width / size.height);
  const rotation = [q.x, q.y, q.z, q.w];
  const lens = [scaleX, scaleY, view.distance, 0];
  return new Float32Array([...rotation, ...lens, size.width, size.height, 0, 0]);
}

function lensScale(view: View, aspect: number): readonly [number, number] {
  const longer = Math.tan(degreesToRadians(view.fov) * HALF);
  return aspect >= 1 ? [longer, longer / aspect] : [longer * aspect, longer];
}

// Where a unit ray from the camera at (-distance, 0, 0) meets the unit sphere ahead of it.
function onSphere(ray: Vector3, distance: number): Vector3 {
  const along = distance * ray[0];
  const reach = along + Math.sqrt(along * along - distance * distance + 1);
  return [reach * ray[0] - distance, reach * ray[1], reach * ray[2]];
}

function unit(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
