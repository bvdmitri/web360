import type {
  OpenedRecording,
  OrientationSample,
  RandomAccessSource,
  Span,
  Stabilization,
} from '@web360/core';

import type { Platform } from './platform';

/**
 * How to render: the output width (the height is half), the span in seconds of the recording, the
 * stabilization and its smoothing (the time constant of `smooth` and `follow`, in seconds), whether
 * to match the lenses' colour (a camera that stitches itself has none to match), a signal to
 * cancel, and, outside a browser, the platform.
 */
export interface RenditionOptions {
  readonly width: number;
  readonly from?: number;
  readonly to?: number;
  readonly stabilization?: Stabilization;
  readonly smoothing?: number;
  readonly gainMatching?: boolean;
  readonly signal?: AbortSignal;
  readonly platform?: Platform;
}

/** An opened recording and the files its frames are read from, as a vendor's opener returns them. */
export type SourcedRecording = OpenedRecording & {
  readonly sources: readonly RandomAccessSource[];
};

/** What the frame loop is given once a rendition is open. */
export interface OpenedRendition {
  readonly opened: SourcedRecording;
  readonly attitude: readonly OrientationSample[];
  readonly view: readonly OrientationSample[];
  readonly span: Span;
  readonly from: number;
  readonly frameDuration: number;
  readonly device: GPUDevice;
  readonly platform: Platform;
  readonly options: RenditionOptions;
}
