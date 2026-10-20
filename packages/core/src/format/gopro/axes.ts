const AXES = 'XYZ';

/** A GPMF `ORIN` axis order that does not name each of X, Y and Z exactly once. */
export class UnsupportedOrientationError extends Error {
  public override readonly name = 'UnsupportedOrientationError';
}

/**
 * Rearranges a three-axis GPMF sample into the camera's X, Y and Z, by its stream's `ORIN` order.
 *
 * @remarks `ORIN` names, channel by channel, the camera axis each stored component measures: `ZXY`
 * stores Z first, then X, then Y. A lower-case letter means the channel measures that axis negated
 * (`Zxy`: the second channel is minus X). An empty order means the components are already X, Y, Z.
 * An order that does not name each axis once throws {@link UnsupportedOrientationError}.
 */
export function orient(sample: readonly number[], order: string): [number, number, number] {
  const out: [number, number, number] = [sample[0] ?? 0, sample[1] ?? 0, sample[2] ?? 0];
  if (order === '') return out;
  const channels = channelsOf(order);
  for (const [channel, { axis, sign }] of channels.entries())
    out[axis] = sign * (sample[channel] ?? 0);
  return out;
}

interface Channel {
  readonly axis: number;
  readonly sign: number;
}

function channelsOf(order: string): Channel[] {
  const channels = Array.from(order, (letter) => ({
    axis: AXES.indexOf(letter.toUpperCase()),
    sign: letter === letter.toUpperCase() ? 1 : -1,
  }));
  const axes = new Set(channels.map((channel) => channel.axis));
  if (channels.length !== AXES.length || axes.size !== AXES.length || axes.has(-1)) {
    throw new UnsupportedOrientationError(`'${order}' is not an order of X, Y and Z`);
  }
  return channels;
}
