import type { Insta360Opened, OrientationSample, Seconds, Span, Stabilization } from '@web360/core';

import type { Platform } from './platform';

/**
 * How to render: the output width (the height is half), the span in seconds of the recording, the
 * stabilization and its smoothing, whether to match the lenses' colour, a signal to cancel, and,
 * outside a browser, the platform.
 */
export interface RenditionOptions {
  readonly width: number;
  readonly from?: number;
  readonly to?: number;
  readonly stabilization?: Stabilization;
  readonly smoothing?: Seconds;
  readonly gainMatching?: boolean;
  readonly signal?: AbortSignal;
  readonly platform?: Platform;
}

/** What the frame loop is given once a rendition is open. */
export interface OpenedRendition {
  readonly opened: Insta360Opened;
  readonly attitude: readonly OrientationSample[];
  readonly view: readonly OrientationSample[];
  readonly span: Span;
  readonly from: number;
  readonly frameDuration: number;
  readonly device: GPUDevice;
  readonly platform: Platform;
  readonly options: RenditionOptions;
}
