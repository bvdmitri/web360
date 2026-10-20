// Render a span of a recording to an MP4 file in memory, encoded with
// Mediabunny.
import { openRendition } from '@bvdmitri/web360';
import {
  BufferTarget,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSource,
} from 'mediabunny';

// An MP4 written to memory, with one H.264 video track.
function mp4(): {
  output: Output<Mp4OutputFormat, BufferTarget>;
  video: VideoSampleSource;
} {
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  const video = new VideoSampleSource({
    codec: 'avc',
    quality: new Quality({ bitrate: 30e6 }),
  });
  output.addVideoTrack(video);
  return { output, video };
}

export async function renderToMp4(
  file: File,
  from: number,
  to: number,
): Promise<Blob> {
  const rendition = await openRendition(
    { main: { blob: file, name: file.name } },
    { width: 3840, from, to, stabilization: 'smooth' },
  );
  const { output, video } = mp4();
  await output.start();
  try {
    for await (const frame of rendition.frames()) {
      const sample = new VideoSample(frame); // keeps the frame's timestamp
      await video.add(sample);
      sample.close();
      frame.close();
    }
  } finally {
    rendition.dispose();
  }
  await output.finalize();
  const bytes = output.target.buffer ?? new ArrayBuffer(0);
  return new Blob([bytes], { type: 'video/mp4' });
}
