import { describe, expect, it } from 'vitest';

import type { LensOptics } from '../model/recording';
import { degrees } from '../shared/units/units';
import type { LensSampler, Rgb } from './render';
import { devignette, estimateVignetting } from './vignetting';

const lens = (fovDegrees: number, roll: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1000,
  fieldOfView: degrees(fovDegrees),
  coverage: degrees(fovDegrees),
  center: [1000, 1000],
  orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(roll) },
});

const front = lens(193, 0);
const back = lens(193, 180);
const grid = { width: 128, height: 64 };
const TRUE_STRENGTH = 0.8;

const reachOf = (pixel: readonly [number, number]): number =>
  Math.hypot(pixel[0] - 1000, pixel[1] - 1000) / 1000;

// A lens that records a flat grey darkened toward its edge by exp(-k * reach^2).
const vignetted =
  (grey: number): LensSampler =>
  (pixel) => {
    const reach = reachOf(pixel);
    const value = grey * Math.exp(-TRUE_STRENGTH * reach * reach);
    return [value, value, value];
  };

const constant =
  (colour: Rgb): LensSampler =>
  () =>
    colour;

describe('vignetting', () => {
  it('recovers the falloff strength over the overlap, whatever each lens exposes', () => {
    const measured = estimateVignetting([front, back], [vignetted(0.6), vignetted(0.3)], grid);
    expect(measured.strength).toBeCloseTo(TRUE_STRENGTH, 6);
  });

  it('reports where the overlap, and so the measurement, begins', () => {
    const measured = estimateVignetting([front, back], [vignetted(0.6), vignetted(0.3)], grid);
    const innermost = (180 - 193 / 2) / (193 / 2);
    expect(measured.start).toBeGreaterThan(innermost - 0.01);
    expect(measured.start).toBeLessThan(1);
  });

  it('flattens the whole lens when the falloff is applied from the centre', () => {
    const [corrected] = devignette([front], [vignetted(0.6)], {
      strength: TRUE_STRENGTH,
      start: 0,
    });
    for (const pixel of [
      [1000, 1000],
      [1500, 1000],
      [1000, 1990],
    ] as const) {
      expect(corrected?.(pixel)[0]).toBeCloseTo(0.6, 9);
    }
  });

  it('leaves the interior alone and lifts only beyond where the falloff starts', () => {
    const [corrected] = devignette([front], [constant([0.5, 0.5, 0.5])], {
      strength: TRUE_STRENGTH,
      start: 0.9,
    });
    expect(corrected?.([1500, 1000])[0]).toBe(0.5);
    const rim = corrected?.([2000, 1000])[0] ?? 0;
    expect(rim).toBeCloseTo(0.5 * Math.exp(TRUE_STRENGTH * (1 - 0.81)), 9);
  });

  it('finds no falloff in a flat image', () => {
    const measured = estimateVignetting(
      [front, back],
      [constant([0.6, 0.6, 0.6]), constant([0.3, 0.3, 0.3])],
      grid,
    );
    expect(measured.strength).toBeCloseTo(0, 9);
  });

  it('finds no falloff without an overlap or without light', () => {
    expect(estimateVignetting([lens(60, 0)], [constant([0.5, 0.5, 0.5])], grid)).toEqual({
      strength: 0,
      start: 1,
    });
    const dark = [constant([0, 0, 0]), constant([0.5, 0.5, 0.5])];
    expect(estimateVignetting([front, back], dark, grid).strength).toBe(0);
  });

  it('is black for a lens without a sampler', () => {
    const [, missing] = devignette([front, back], [vignetted(0.6)], {
      strength: TRUE_STRENGTH,
      start: 0,
    });
    expect(missing?.([1000, 1000])).toEqual([0, 0, 0]);
  });
});
