// Export a flat 16:9 video from a 360 one along a keyframed path, with
// Mediabunny decoding, copying the audio and encoding.
import {
  createReframer,
  viewAt,
  type Reframer,
  type ViewKeyframe,
} from '@bvdmitri/web360';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
} from 'mediabunny';

const WIDTH = 1920;
const HEIGHT = 1080;

// Each 360 frame in, its view at the frame's time (in seconds) out.
function reframed(
  reframer: Reframer,
  keyframes: readonly ViewKeyframe[],
): (sample: VideoSample) => Promise<VideoSample> {
  return async (sample) => {
    const frame = sample.toVideoFrame();
    const view = viewAt(keyframes, sample.timestamp);
    const flat = await reframer.reframe(frame, view);
    frame.close();
    return new VideoSample(flat);
  };
}

export async function reframeToMp4(
  file: File,
  keyframes: readonly ViewKeyframe[],
  onProgress: (share: number) => void,
): Promise<Blob> {
  const reframer = await createReframer({ width: WIDTH, height: HEIGHT });
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  try {
    const source = new BlobSource(file);
    const conversion = await Conversion.init({
      input: new Input({ formats: ALL_FORMATS, source }),
      output,
      video: {
        processedWidth: WIDTH,
        processedHeight: HEIGHT,
        process: reframed(reframer, keyframes),
      },
    });
    conversion.onProgress = onProgress;
    await conversion.execute();
  } finally {
    reframer.destroy();
  }
  const bytes = output.target.buffer ?? new ArrayBuffer(0);
  return new Blob([bytes], { type: 'video/mp4' });
}
