import { degrees, type Degrees } from '../../shared/units/units';

const SEPARATOR = '_';

/** One lens's pose in the calibration canvas: its fisheye radius, centre and orientation. */
export interface LensPose {
  readonly radius: number;
  readonly center: readonly [number, number];
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

/** A v1 lens calibration: a pose per lens and the pixel canvas the poses are stated on. */
export interface Calibration {
  readonly lenses: readonly LensPose[];
  readonly canvas: readonly [number, number];
}

/** A calibration string this does not read, such as a v2, v3 or v6 layout. */
export class UnsupportedCalibrationError extends Error {
  public override readonly name = 'UnsupportedCalibrationError';

  public constructor(detail: string) {
    super(`unsupported calibration: ${detail}`);
  }
}

/**
 * Parses a v1 `offset` calibration string into per-lens poses.
 *
 * @remarks The string is underscore-separated numbers: a lens count, then six numbers a lens
 * (radius, centre x and y, then yaw, pitch and roll in degrees), then the canvas width and height
 * and a version word. The ONE R and the older X-series write this v1 layout. A string too short,
 * or one with tokens left over (a v2, v3 or v6 layout has more a lens), is refused with
 * {@link UnsupportedCalibrationError}.
 */
export function readCalibration(text: string): Calibration {
  const tokens = text.split(SEPARATOR).map(Number);
  let cursor = 0;
  const next = (): number => {
    const value = tokens[cursor];
    cursor += 1;
    if (value === undefined) throw new UnsupportedCalibrationError('the string is too short');
    return value;
  };
  const lensCount = next();
  const lenses: LensPose[] = [];
  for (let lens = 0; lens < lensCount; lens += 1) lenses.push(readPose(next));
  const canvas: [number, number] = [next(), next()];
  next();
  if (cursor !== tokens.length) {
    throw new UnsupportedCalibrationError(`${tokens.length} tokens is not the v1 layout`);
  }
  return { lenses, canvas };
}

function readPose(next: () => number): LensPose {
  const radius = next();
  const centerX = next();
  const centerY = next();
  const yaw = next();
  const pitch = next();
  const roll = next();
  return {
    radius,
    center: [centerX, centerY],
    yaw: degrees(yaw),
    pitch: degrees(pitch),
    roll: degrees(roll),
  };
}
