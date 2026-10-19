declare const unit: unique symbol;

/**
 * A number tagged with its unit at the type level only.
 *
 * @remarks The tag has no runtime cost: a branded value is the number itself. It exists so that a
 * camera's microsecond clock cannot be passed where seconds are expected, or degrees where
 * radians are, without an explicit conversion below.
 */
export type Quantity<Unit extends string> = number & { readonly [unit]: Unit };

export type Degrees = Quantity<'degrees'>;
export type Radians = Quantity<'radians'>;
export type Seconds = Quantity<'seconds'>;
export type Microseconds = Quantity<'microseconds'>;

const DEGREES_PER_HALF_TURN = 180;
const MICROSECONDS_PER_SECOND = 1_000_000;

function finite<Unit extends string>(value: number, name: Unit): Quantity<Unit> {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite, got ${value}`);
  return value as Quantity<Unit>;
}

export const degrees = (value: number): Degrees => finite(value, 'degrees');
export const radians = (value: number): Radians => finite(value, 'radians');
export const seconds = (value: number): Seconds => finite(value, 'seconds');
export const microseconds = (value: number): Microseconds => finite(value, 'microseconds');

export const degreesToRadians = (value: Degrees): Radians =>
  radians((value * Math.PI) / DEGREES_PER_HALF_TURN);

export const radiansToDegrees = (value: Radians): Degrees =>
  degrees((value * DEGREES_PER_HALF_TURN) / Math.PI);

export const microsecondsToSeconds = (value: Microseconds): Seconds =>
  seconds(value / MICROSECONDS_PER_SECOND);

/** Seconds to whole microseconds, rounded to the nearest. */
export const secondsToMicroseconds = (value: Seconds): Microseconds =>
  microseconds(Math.round(value * MICROSECONDS_PER_SECOND));
