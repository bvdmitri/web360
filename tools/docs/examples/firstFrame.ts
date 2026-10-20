// Show one stabilized frame of a recording, for a thumbnail or a preview.
import { openRendition } from '@bvdmitri/web360';

// Half a second of the recording always holds a frame to show.
const SPAN_SECONDS = 0.5;

export async function previewFrame(
  file: File,
  at: number,
): Promise<ImageBitmap | undefined> {
  const rendition = await openRendition(
    { main: { blob: file } },
    { width: 1024, from: at, to: at + SPAN_SECONDS },
  );
  try {
    const { value: frame } = await rendition.frames().next();
    if (frame === undefined) return undefined;
    const bitmap = await createImageBitmap(frame);
    frame.close();
    return bitmap;
  } finally {
    rendition.dispose();
  }
}
