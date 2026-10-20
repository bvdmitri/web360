declare const unit: unique symbol;

/**
 * A number tagged with its unit at the type level only.
 *
 * @remarks The tag has no runtime cost: a branded value is the number itself. It exists so that a
 * camera's microsecond clock cannot be passed where seconds are expected, or degrees where
 * radians are, without an explicit conversion below.
 */
export type Quantity<Unit extends string> = number & { readonly [unit]: Unit };

/** An angle in degrees, as calibrations and fields of view are stated. */
export type Degrees = Quantity<'degrees'>;
/** An angle in radians, as the maths works in. */
export type Radians = Quantity<'radians'>;
/** A duration or a time in seconds. */
export type Seconds = Quantity<'seconds'>;
/** A time in microseconds, as media clocks and motion timestamps are kept. */
export type Microseconds = Quantity<'microseconds'>;

const DEGREES_PER_HALF_TURN = 180;
const MICROSECONDS_PER_SECOND = 1_000_000;

function finite<Unit extends string>(value: number, name: Unit): Quantity<Unit> {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite, got ${value}`);
  return value as Quantity<Unit>;
}

/**
 * A number tagged with its unit: `degrees`, `radians`, `seconds` and `microseconds` throw a
 * `RangeError` for a value that is not finite, so a unit never carries `NaN` or an infinity.
 */
export const degrees = (value: number): Degrees => finite(value, 'degrees');
export const radians = (value: number): Radians => finite(value, 'radians');
export const seconds = (value: number): Seconds => finite(value, 'seconds');
export const microseconds = (value: number): Microseconds => finite(value, 'microseconds');

/** Degrees to radians. */
export const degreesToRadians = (value: Degrees): Radians =>
  radians((value * Math.PI) / DEGREES_PER_HALF_TURN);

/** Radians to degrees. */
export const radiansToDegrees = (value: Radians): Degrees =>
  degrees((value * DEGREES_PER_HALF_TURN) / Math.PI);

/** Microseconds to seconds. */
export const microsecondsToSeconds = (value: Microseconds): Seconds =>
  seconds(value / MICROSECONDS_PER_SECOND);

/** Seconds to whole microseconds, rounded to the nearest. */
export const secondsToMicroseconds = (value: Seconds): Microseconds =>
  microseconds(Math.round(value * MICROSECONDS_PER_SECOND));
