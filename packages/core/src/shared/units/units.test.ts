import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  degrees,
  degreesToRadians,
  microseconds,
  microsecondsToSeconds,
  radians,
  radiansToDegrees,
  seconds,
  secondsToMicroseconds,
  type Degrees,
  type Radians,
  type Seconds,
} from './units';

describe('units', () => {
  it('converts angles both ways', () => {
    expect(degreesToRadians(degrees(180))).toBe(Math.PI);
    expect(radiansToDegrees(radians(Math.PI / 2))).toBe(90);
  });

  it('converts times both ways', () => {
    expect(microsecondsToSeconds(microseconds(1_500_000))).toBe(1.5);
    expect(secondsToMicroseconds(seconds(0.033367))).toBe(33_367);
  });

  it('round-trips angles within a rounding error', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (value) => {
        const back = radiansToDegrees(degreesToRadians(degrees(value)));
        expect(back).toBeCloseTo(value, 6);
      }),
    );
  });

  it('refuses a value that is not a finite number', () => {
    expect(() => degrees(NaN)).toThrow('degrees must be finite, got NaN');
    expect(() => radians(NaN)).toThrow('radians must be finite');
    expect(() => seconds(Infinity)).toThrow('seconds must be finite, got Infinity');
    expect(() => microseconds(-Infinity)).toThrow('microseconds must be finite');
  });

  it('keeps units apart at compile time', () => {
    expectTypeOf(degrees(1)).toEqualTypeOf<Degrees>();
    expectTypeOf(degreesToRadians).parameter(0).not.toEqualTypeOf<Radians>();
    expectTypeOf(seconds(1)).not.toEqualTypeOf<number>();
    // @ts-expect-error a plain number is not a duration
    const unbranded: Seconds = 1;
    expect(unbranded).toBe(1);
  });
});
