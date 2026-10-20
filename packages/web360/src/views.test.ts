import { describe, expect, it } from 'vitest';

import { clampView, DEFAULT_VIEW, VIEW_PRESETS, viewAt } from './views';

describe('views in plain degrees', () => {
  it('clamps and wraps a view', () => {
    expect(clampView({ ...DEFAULT_VIEW, pan: 200, tilt: 100, distance: 3 })).toEqual({
      ...DEFAULT_VIEW,
      pan: -160,
      tilt: 90,
      distance: 1,
    });
  });

  it('refuses a part that is not a number', () => {
    expect(() => clampView({ ...DEFAULT_VIEW, fov: NaN })).toThrow(RangeError);
    expect(() => clampView({ ...DEFAULT_VIEW, distance: Infinity })).toThrow(RangeError);
  });

  it('follows a keyframed path given in seconds', () => {
    const path = [
      { time: 1, view: { ...DEFAULT_VIEW, pan: 0 } },
      { time: 3, view: { ...DEFAULT_VIEW, ...VIEW_PRESETS.tinyPlanet, pan: 40 } },
    ];
    expect(viewAt(path, 0).pan).toBe(0);
    expect(viewAt(path, 2).pan).toBeCloseTo(20, 9);
    expect(viewAt(path, 2).tilt).toBeCloseTo(-45, 9);
    expect(viewAt(path, 9)).toMatchObject({ pan: 40, distance: 1 });
  });

  it('starts straight ahead through the linear lens', () => {
    expect(DEFAULT_VIEW).toEqual({ pan: 0, tilt: 0, roll: 0, ...VIEW_PRESETS.linear });
  });
});
