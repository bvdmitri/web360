import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rotate, type Vector3 } from '../shared/math/quaternion';
import { degrees } from '../shared/units/units';
import { clampView, VIEW_LIMITS, VIEW_PRESETS, viewRotation, type View } from './view';

const view = (parts: Partial<Record<keyof View, number>> = {}): View => ({
  pan: degrees(parts.pan ?? 0),
  tilt: degrees(parts.tilt ?? 0),
  roll: degrees(parts.roll ?? 0),
  fov: degrees(parts.fov ?? 90),
  distance: parts.distance ?? 0,
});

const expectVecClose = (a: Vector3, b: Vector3): void => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
  expect(a[2]).toBeCloseTo(b[2], 9);
};

const FORWARD: Vector3 = [1, 0, 0];
const UP: Vector3 = [0, 0, 1];

const looks = (parts: Partial<Record<keyof View, number>>, along: Vector3): Vector3 =>
  rotate(viewRotation(view(parts)), along);

describe('the view rotation', () => {
  it('looks forward, up kept up, at rest', () => {
    expectVecClose(looks({}, FORWARD), FORWARD);
    expectVecClose(looks({}, UP), UP);
  });

  it('turns right as the pan grows', () => {
    expectVecClose(looks({ pan: 90 }, FORWARD), [0, -1, 0]);
  });

  it('looks up as the tilt grows', () => {
    expectVecClose(looks({ tilt: 90 }, FORWARD), UP);
  });

  it('leans the top of the picture to the right as the roll grows', () => {
    expectVecClose(looks({ roll: 90 }, UP), [0, -1, 0]);
  });

  it('tilts about the panned right, so a panned view still looks up', () => {
    expectVecClose(looks({ pan: 90, tilt: 45 }, FORWARD), [0, -Math.SQRT1_2, Math.SQRT1_2]);
  });

  it('keeps the forward direction when rolling', () => {
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), (roll) => {
        const turned = looks({ pan: 30, tilt: -20, roll }, FORWARD);
        const plain = looks({ pan: 30, tilt: -20 }, FORWARD);
        expectVecClose(turned, plain);
      }),
    );
  });
});

describe('clamping a view', () => {
  it('wraps the pan into a half-open turn around zero', () => {
    expect(clampView(view({ pan: 190 })).pan).toBeCloseTo(-170, 9);
    expect(clampView(view({ pan: -180 })).pan).toBeCloseTo(180, 9);
    expect(clampView(view({ pan: 540 })).pan).toBeCloseTo(180, 9);
  });

  it('holds the tilt, roll, field of view and distance to their limits', () => {
    const clamped = clampView(view({ tilt: 120, roll: -200, fov: 400, distance: 2 }));
    expect(clamped.tilt).toBe(VIEW_LIMITS.tilt.max);
    expect(clamped.roll).toBe(VIEW_LIMITS.roll.min);
    expect(clamped.fov).toBe(VIEW_LIMITS.fov.max);
    expect(clamped.distance).toBe(VIEW_LIMITS.distance.max);
    const low = clampView(view({ tilt: -120, fov: 1, distance: -1 }));
    expect(low.tilt).toBe(VIEW_LIMITS.tilt.min);
    expect(low.fov).toBe(VIEW_LIMITS.fov.min);
    expect(low.distance).toBe(VIEW_LIMITS.distance.min);
  });

  it('leaves a view inside its limits as it is', () => {
    const inside = view({ pan: 12, tilt: -3, roll: 4, fov: 100, distance: 0.5 });
    expect(clampView(inside)).toEqual(inside);
  });
});

describe('the lens presets', () => {
  it('runs from a flat lens to a tiny planet, widening and stepping back', () => {
    const order = ['linear', 'dewarp', 'ultra', 'mega', 'tinyPlanet'] as const;
    for (const [index, name] of order.entries()) {
      const preset = VIEW_PRESETS[name];
      const previous = index === 0 ? undefined : VIEW_PRESETS[order[index - 1] ?? name];
      expect(clampView({ ...view(), ...preset })).toEqual({ ...view(), ...preset });
      if (previous === undefined) {
        continue;
      }

      expect(preset.fov).toBeGreaterThan(previous.fov);
      expect(preset.distance).toBeGreaterThan(previous.distance);
    }
    expect(VIEW_PRESETS.linear.distance).toBe(0);
    expect(VIEW_PRESETS.tinyPlanet).toMatchObject({ distance: 1, tilt: -90 });
  });
});
