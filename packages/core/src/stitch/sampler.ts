/** A linear colour as red, green and blue in `[0, 1]`. */
export type Rgb = readonly [number, number, number];

/** Reads the colour a lens recorded at a pixel of its image. */
export type LensSampler = (pixel: readonly [number, number]) => Rgb;
