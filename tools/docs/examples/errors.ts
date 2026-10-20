// Every failure to open or render is a Web360Error whose code says why;
// turn it into a message.
import {
  openRendition,
  Web360Error,
  type RenditionSource,
  type Web360ErrorCode,
} from '@bvdmitri/web360';

const MESSAGES: Record<Web360ErrorCode, string> = {
  'render-unavailable':
    'This browser has no WebGPU. Try a current Chrome or Edge.',
  'webcodecs-unavailable':
    'This browser cannot decode video with WebCodecs.',
  'codec-unsupported':
    "This browser cannot decode this camera's video (often 8K HEVC).",
  decode: 'The video could not be decoded partway through.',
  'missing-second-file':
    'This recording has two lens files: add the matching _10_ file.',
  'unreadable-recording': 'This file is not a recording web360 reads.',
};

export async function describeFailure(
  source: RenditionSource,
): Promise<string | undefined> {
  try {
    const rendition = await openRendition(source, { width: 256 });
    rendition.dispose();
    return undefined;
  } catch (error) {
    if (error instanceof Web360Error) return MESSAGES[error.code];
    throw error;
  }
}
