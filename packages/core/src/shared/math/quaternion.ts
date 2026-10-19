/** A 3-vector as x, y, z. */
export type Vector3 = readonly [number, number, number];

/**
 * A rotation as a quaternion, scalar part `w` first.
 *
 * @remarks Rotations compose and integrate without the gimbal lock and wraparound of Euler angles,
 * which is why orientation from a gyro stream is carried this way. The functions here assume unit
 * quaternions unless a function says otherwise; {@link normalize} restores unit length after a
 * chain of multiplications has let rounding drift in.
 */
export interface Quaternion {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The identity rotation. */
export function identity(): Quaternion {
  return { w: 1, x: 0, y: 0, z: 0 };
}

/** The Hamilton product `a ⊗ b`: the rotation `b` followed by the rotation `a`. */
export function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** The conjugate, which for a unit quaternion is its inverse rotation. */
export function conjugate(q: Quaternion): Quaternion {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

/** The quaternion scaled to unit length; the zero quaternion maps to the identity. */
export function normalize(q: Quaternion): Quaternion {
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  return length === 0
    ? identity()
    : { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}

/**
 * The rotation a rotation vector describes: its direction is the axis, its length the angle in
 * radians.
 *
 * @remarks This is the exponential map that turns an angular step into a rotation: a gyro reading
 * `ω` (rad/s) over a time step `dt` rotates the device by `fromRotationVector([ωx·dt, ωy·dt,
 * ωz·dt])`. A zero vector is the identity.
 */
export function fromRotationVector(v: Vector3): Quaternion {
  const theta = Math.hypot(v[0], v[1], v[2]);
  if (theta === 0) return identity();
  const scale = Math.sin(theta / 2) / theta;
  return { w: Math.cos(theta / 2), x: v[0] * scale, y: v[1] * scale, z: v[2] * scale };
}

const NEARLY_PARALLEL = 0.9995;

/**
 * Spherical linear interpolation between two unit rotations, `t` from `a` (0) to `b` (1).
 *
 * @remarks Follows the shorter arc (a quaternion and its negation are the same rotation, so `b` is
 * negated when that is closer) at a constant angular rate, which is what sampling an attitude or a
 * correction between its stored samples needs. When the two are nearly parallel it falls back to a
 * normalized linear blend, where the great-circle formula would divide by a vanishing sine.
 */
export function slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
  const aligned = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  const end = aligned < 0 ? negate(b) : b;
  const dot = Math.abs(aligned);
  if (dot > NEARLY_PARALLEL) return normalize(lerp(a, end, t));
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  return add4(
    scale4(a, Math.sin((1 - t) * theta) / sinTheta),
    scale4(end, Math.sin(t * theta) / sinTheta),
  );
}

/** `v` rotated by the unit quaternion `q`. */
export function rotate(q: Quaternion, v: Vector3): Vector3 {
  const [x, y, z] = v;
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return [
    x + q.w * tx + (q.y * tz - q.z * ty),
    y + q.w * ty + (q.z * tx - q.x * tz),
    z + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

function negate(q: Quaternion): Quaternion {
  return { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
}

function lerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
  return {
    w: a.w + (b.w - a.w) * t,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function add4(a: Quaternion, b: Quaternion): Quaternion {
  return { w: a.w + b.w, x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale4(q: Quaternion, factor: number): Quaternion {
  return { w: q.w * factor, x: q.x * factor, y: q.y * factor, z: q.z * factor };
}
