import {
  fromRotationVector,
  identity,
  type Quaternion,
  type Vector3,
} from '../shared/math/quaternion';

const DIAGONAL_ORDER = 3;
const QUARTER = Math.PI / 2;
const THIRD = (2 * Math.PI) / DIAGONAL_ORDER;
const QUARTER_TURNS = [QUARTER, Math.PI, -QUARTER];
const THIRD_TURNS = [THIRD, -THIRD];
const AXES: Vector3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const EDGES: Vector3[] = [
  [1, 1, 0],
  [1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
];
const CORNERS: Vector3[] = [
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [-1, 1, 1],
];

/**
 * The 24 rotations that map the coordinate axes onto signed coordinate axes, identity first.
 *
 * @remarks An IMU is mounted square to the camera body, so the rotation from its axes to the lens
 * calibration frame is, to within a mounting tolerance, one of these: the rotations of a cube. They
 * are the candidates a calibration search tries. Built as the identity, quarter, half and
 * three-quarter turns about each axis, half turns about the six edge diagonals, and third turns
 * about the four body diagonals.
 */
export function axisAlignments(): Quaternion[] {
  return [
    identity(),
    ...AXES.flatMap((axis) => QUARTER_TURNS.map((angle) => turn(axis, angle))),
    ...EDGES.map((axis) => turn(axis, Math.PI)),
    ...CORNERS.flatMap((axis) => THIRD_TURNS.map((angle) => turn(axis, angle))),
  ];
}

function turn(axis: Vector3, angle: number): Quaternion {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  const scale = angle / length;
  return fromRotationVector([axis[0] * scale, axis[1] * scale, axis[2] * scale]);
}
