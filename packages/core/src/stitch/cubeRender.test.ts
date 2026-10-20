import { describe, expect, it } from 'vitest';

import { goproCubeMap } from '../format/gopro/cube';
import { fromRotationVector, identity } from '../shared/math/quaternion';
import { renderCubeMap, type TextureSampler } from './cubeRender';
import type { Rgb } from './sampler';

const cube = goproCubeMap({ width: 5888, height: 1920 });

// Each face of each track painted its own colour, so the render shows which face it read.
const painted =
  (colours: readonly Rgb[]): TextureSampler =>
  (pixel) =>
    colours[Math.min(2, Math.floor(pixel[0] / 1984))] ?? [0, 0, 0];
const RED: Rgb = [1, 0, 0];
const GREEN: Rgb = [0, 1, 0];
const BLUE: Rgb = [0, 0, 1];
const samplers = [
  painted([RED, GREEN, BLUE]),
  painted([
    [1, 1, 0],
    [0, 1, 1],
    [1, 0, 1],
  ]),
];

describe('cube map render', () => {
  it('shows the front face ahead, the up face above and the down face below', () => {
    const pixels = renderCubeMap({ cube, samplers, correction: identity(), width: 8, height: 3 });
    // Around the horizon, longitudes 112.5, 22.5, -67.5 and -157.5 degrees: left, front, right, back.
    expect([pixels[9], pixels[11], pixels[13], pixels[15]]).toEqual([RED, GREEN, BLUE, [0, 1, 1]]);
    expect(pixels[3]).toEqual([1, 0, 1]);
    expect(pixels[19]).toEqual([1, 1, 0]);
  });

  it('turns the view by the correction', () => {
    const turned = fromRotationVector([0, 0, Math.PI / 2]);
    const pixels = renderCubeMap({ cube, samplers, correction: turned, width: 8, height: 3 });
    // The pixel that looked 22.5 degrees left of ahead now looks 112.5 degrees left: the left face.
    expect(pixels[11]).toEqual(RED);
  });

  it('is black where a texture has no sampler', () => {
    const pixels = renderCubeMap({
      cube,
      samplers: [samplers[0]!],
      correction: identity(),
      width: 4,
      height: 3,
    });
    expect(pixels[1]).toEqual([0, 0, 0]);
  });
});
