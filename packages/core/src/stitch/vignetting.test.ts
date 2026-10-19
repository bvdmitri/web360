import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { degrees } from '../shared/units/units';
import type { LensSampler, Rgb } from './render';
import { devignette, estimateVignetting } from './vignetting';

const lens = (fovDegrees: number, roll: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(fovDegrees),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(roll) },
});

const front = lens(193, 0);
const back = lens(193, 180);
const grid = { width: 128, height: 64 };
const TRUE_STRENGTH = 0.8;

// A lens that records a flat grey darkened toward its edge by exp(-k * reach^2).
const vignetted =
  (grey: number): LensSampler =>
  (pixel) => {
    const reach = Math.hypot(pixel[0] - 1000, pixel[1] - 1000) / 1000;
    const value = grey * Math.exp(-TRUE_STRENGTH * reach * reach);
    return [value, value, value];
  };

const constant =
  (colour: Rgb): LensSampler =>
  () =>
    colour;

describe('vignetting', () => {
  it('recovers the falloff strength from the overlap, whatever each lens exposes', () => {
    const strength = estimateVignetting([front, back], [vignetted(0.6), vignetted(0.3)], grid);
    expect(strength).toBeCloseTo(TRUE_STRENGTH, 6);
  });

  it('flattens a vignetted lens back to its exposure once corrected', () => {
    const [corrected] = devignette([front], [vignetted(0.6)], TRUE_STRENGTH);
    expect(corrected?.([1000, 1000])[0]).toBeCloseTo(0.6, 9);
    expect(corrected?.([1500, 1000])[0]).toBeCloseTo(0.6, 9);
    expect(corrected?.([1000, 1990])[0]).toBeCloseTo(0.6, 9);
  });

  it('finds no falloff in a flat image', () => {
    const strength = estimateVignetting(
      [front, back],
      [constant([0.6, 0.6, 0.6]), constant([0.3, 0.3, 0.3])],
      grid,
    );
    expect(strength).toBeCloseTo(0, 9);
  });

  it('finds no falloff without an overlap or without light', () => {
    expect(estimateVignetting([lens(60, 0)], [constant([0.5, 0.5, 0.5])], grid)).toBe(0);
    expect(
      estimateVignetting([front, back], [constant([0, 0, 0]), constant([0.5, 0.5, 0.5])], grid),
    ).toBe(0);
  });

  it('is black for a lens without a sampler', () => {
    const [, missing] = devignette([front, back], [vignetted(0.6)], TRUE_STRENGTH);
    expect(missing?.([1000, 1000])).toEqual([0, 0, 0]);
  });
});
