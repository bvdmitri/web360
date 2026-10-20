// Report progress while frames come, and stop on request: an aborted signal
// ends `frames()` with the signal's reason, and `dispose()` releases the
// GPU.
import { openRendition } from '@bvdmitri/web360';

const MICROSECONDS_PER_SECOND = 1_000_000;

export async function renderWithProgress(
  file: File,
  handle: (frame: VideoFrame) => Promise<void>,
  options: { signal: AbortSignal; onProgress: (done: number) => void },
): Promise<void> {
  const rendition = await openRendition(
    { main: { blob: file } },
    { width: 2880, signal: options.signal },
  );
  try {
    for await (const frame of rendition.frames()) {
      // Timestamps are microseconds from the span's start; the span's
      // length is in seconds.
      options.onProgress(
        frame.timestamp / MICROSECONDS_PER_SECOND / rendition.duration,
      );
      await handle(frame);
      frame.close();
    }
  } finally {
    rendition.dispose();
  }
}
