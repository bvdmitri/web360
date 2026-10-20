// Look around in a playing 360 video: a canvas over the <video>, redrawn on
// every video frame and on every drag.
import {
  clampView,
  createViewer,
  DEFAULT_VIEW,
  type View,
} from '@bvdmitri/web360/view';

const DEGREES_PER_PIXEL = 0.2;

export async function lookAround(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<() => void> {
  const viewer = await createViewer(canvas);
  let view: View = DEFAULT_VIEW;
  let isStopped = false;
  const draw = (): void => {
    if (video.readyState >= 2) void viewer.draw(video, view);
  };
  const onFrame = (): void => {
    if (isStopped) return;
    draw();
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
  // Drag the picture: moving it left turns the view right.
  canvas.addEventListener('pointermove', (event) => {
    if (event.buttons !== 1) return;
    view = clampView({
      ...view,
      pan: view.pan - event.movementX * DEGREES_PER_PIXEL,
      tilt: view.tilt + event.movementY * DEGREES_PER_PIXEL,
    });
    draw();
  });
  return () => {
    isStopped = true;
    viewer.destroy();
  };
}
