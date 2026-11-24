import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { lensPose } from '../../optics/lens';
import { rotate, type Vector3 } from '../../shared/math/quaternion';
import { degrees } from '../../shared/units/units';
import { UnsupportedCalibrationError, type LensPose } from './calibration';
import { facingApart } from './facing';

const OPTICAL_AXIS: Vector3 = [0, 0, 1];
const QUARTER_TURN = 90;
const HALF_TURN = 180;

const pose = (angles: { yaw?: number; pitch?: number; roll: number }): LensPose => ({
  radius: 1,
  center: [0, 0],
  yaw: degrees(angles.yaw ?? 0),
  pitch: degrees(angles.pitch ?? 0),
  roll: degrees(angles.roll),
});

const axisOf = (lens: LensPose): Vector3 =>
  rotate(lensPose({ yaw: lens.yaw, pitch: lens.pitch, roll: lens.roll }), OPTICAL_AXIS);

const facing = (lenses: readonly LensPose[]): number => {
  const [a, b] = lenses.map((lens) => axisOf(lens));
  if (a === undefined || b === undefined) throw new Error('two lenses expected');
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

const small = fc.double({ min: -5, max: 5, noNaN: true });
const deviations = fc.record({
  d0: small,
  d1: small,
  yaw: small,
  pitch: small,
  quarter: fc.boolean(),
});

describe('insta360 lens facing', () => {
  it('keeps poses whose rolls are a half turn apart (the ONE R) as stated', () => {
    const lenses = [pose({ roll: -179.115 }), pose({ roll: 0.4605 })];
    expect(facingApart(lenses)).toEqual(lenses);
  });

  it('turns rolls stated about a quarter turn (the X5) to face lens 0 back and lens 1 front', () => {
    const [back, front] = facingApart([pose({ roll: 90.631 }), pose({ roll: 89.538 })]);
    expect(back?.roll).toBeCloseTo(180.631, 6);
    expect(front?.roll).toBeCloseTo(-0.462, 6);
  });

  it('refuses lenses that face the same way in neither layout', () => {
    expect(() => facingApart([pose({ roll: 10 }), pose({ roll: 20 })])).toThrow(
      UnsupportedCalibrationError,
    );
  });

  it('refuses a calibration that does not have two lenses', () => {
    expect(() => facingApart([pose({ roll: 0 })])).toThrow(UnsupportedCalibrationError);
  });

  it('faces the lenses apart in either layout', () => {
    fc.assert(
      fc.property(deviations, (drawn) => {
        const { d0, d1, yaw, pitch, quarter } = drawn;
        const [base0, base1] = quarter ? [QUARTER_TURN, QUARTER_TURN] : [HALF_TURN, 0];
        const lenses = [
          pose({ yaw, pitch, roll: base0 + d0 }),
          pose({ yaw: -yaw, pitch: -pitch, roll: base1 + d1 }),
        ];
        expect(facing(facingApart(lenses))).toBeLessThan(-0.9);
      }),
    );
  });

  it('never returns lenses facing the same hemisphere', () => {
    const roll = fc.double({ min: -180, max: 180, noNaN: true });
    fc.assert(
      fc.property(roll, roll, (r0, r1) => {
        const lenses = [pose({ roll: r0 }), pose({ roll: r1 })];
        let accepted: readonly LensPose[] | undefined;
        try {
          accepted = facingApart(lenses);
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedCalibrationError);
        }
        if (accepted !== undefined) expect(facing(accepted)).toBeLessThan(0);
      }),
    );
  });
});
