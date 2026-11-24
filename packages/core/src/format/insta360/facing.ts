import { degrees } from '../../shared/units/units';
import { UnsupportedCalibrationError, type LensPose } from './calibration';

const HALF_TURN = 180;
const FULL_TURN = 360;
const QUARTER_TURN = 90;
const LENSES = 2;

// How far a stated roll may sit from its layout's value and still be read in that layout. Any
// pose accepted within it leaves the two optical axes at least 120 degrees apart.
const TOLERANCE = 30;

/**
 * Reads a two-lens v1 calibration's rolls as the poses of two lenses facing apart.
 *
 * @remarks Insta360 bodies state a lens's roll in one of two layouts (FORMAT-insta360.md, ADR
 * 0026). In the half-turn layout (the ONE R) the rolls already face the lenses apart, about 180
 * degrees for lens 0 (the back lens) and 0 for lens 1, and are kept as stated. In the quarter-turn
 * layout (the X5) both rolls sit near 90 degrees, a quarter turn plus each lens's deviation: lens 0
 * is turned a quarter turn further and lens 1 a quarter turn back, which faces them the same way
 * the half-turn layout does. Measured on X5 freefall footage, where this reading registers the
 * seam best. A calibration in neither layout, or without two lenses, is refused with
 * {@link UnsupportedCalibrationError} rather than stitched with both lenses on one hemisphere.
 */
export function facingApart(lenses: readonly LensPose[]): readonly LensPose[] {
  const [back, front] = lenses;
  if (back === undefined || front === undefined || lenses.length !== LENSES) {
    throw new UnsupportedCalibrationError(`${lenses.length} lenses, not two`);
  }
  if (Math.abs(wrapped(back.roll - front.roll)) >= HALF_TURN - TOLERANCE) return lenses;
  if (isNearQuarterTurn(back.roll) && isNearQuarterTurn(front.roll)) {
    return [turned(back, QUARTER_TURN), turned(front, -QUARTER_TURN)];
  }
  throw new UnsupportedCalibrationError(
    `lens rolls ${back.roll} and ${front.roll} face the lenses apart in no known layout`,
  );
}

function isNearQuarterTurn(angle: number): boolean {
  return Math.abs(wrapped(angle - QUARTER_TURN)) <= TOLERANCE;
}

function turned(lens: LensPose, turn: number): LensPose {
  return { ...lens, roll: degrees(lens.roll + turn) };
}

// An angle in degrees brought into [-180, 180).
function wrapped(angle: number): number {
  return ((((angle + HALF_TURN) % FULL_TURN) + FULL_TURN) % FULL_TURN) - HALF_TURN;
}
