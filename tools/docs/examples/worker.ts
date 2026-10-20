// Rendering is heavy: run it in a dedicated Web Worker so the page stays
// responsive. The page posts the picked file; the worker renders and posts
// each frame back (a VideoFrame transfers).
import { openRendition } from '@bvdmitri/web360';

globalThis.addEventListener(
  'message',
  (event: MessageEvent<{ file: File }>) => {
    void (async (): Promise<void> => {
      const rendition = await openRendition(
        { main: { blob: event.data.file } },
        { width: 1920 },
      );
      try {
        for await (const frame of rendition.frames())
          globalThis.postMessage(frame, { transfer: [frame] });
      } finally {
        rendition.dispose();
      }
    })();
  },
);
