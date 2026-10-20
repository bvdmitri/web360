import { MissingLensFileError } from '@web360/core';

/**
 * Why a rendition could not be made, as a code an application can act on.
 *
 * @remarks `render-unavailable`: the browser has no WebGPU device. `webcodecs-unavailable`: it has
 * no WebCodecs. `codec-unsupported`: it cannot decode the recording's video codec. `decode`:
 * decoding failed partway. `missing-second-file`: a split recording was opened without its second
 * file. `unreadable-recording`: the files are not a recording web360 reads.
 */
export type Web360ErrorCode =
  | 'render-unavailable'
  | 'webcodecs-unavailable'
  | 'codec-unsupported'
  | 'decode'
  | 'missing-second-file'
  | 'unreadable-recording';

/** A failure to open or render a rendition, with its {@link Web360ErrorCode}. */
export class Web360Error extends Error {
  public override readonly name = 'Web360Error';
  public readonly code: Web360ErrorCode;

  public constructor(code: Web360ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/**
 * The {@link Web360Error} a failure to open a recording stands for: a missing second file as
 * such, anything else the readers threw as an unreadable recording. A `Web360Error` passes through.
 */
export function openingError(error: unknown): Web360Error {
  if (error instanceof Web360Error) return error;
  if (error instanceof MissingLensFileError) {
    return new Web360Error('missing-second-file', error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Web360Error('unreadable-recording', message, { cause: error });
}
