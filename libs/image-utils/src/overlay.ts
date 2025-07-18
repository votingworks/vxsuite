/* istanbul ignore file - tested externally at point of usage @preserve */
import { createCanvas, ImageData } from 'canvas';

/**
 * Creates a new image consisting of {@link overlay} drawn on top of
 * {@link base}. Assumes the overlay image already has the necessary
 * transparency where needed.
 */
export function overlayImages(base: ImageData, overlay: ImageData): ImageData {
  const overlayCanvas = createCanvas(base.width, base.height);
  const overlayCtx = overlayCanvas.getContext('2d');
  overlayCtx.putImageData(overlay, 0, 0);

  const baseCanvas = createCanvas(base.width, base.height);
  const baseCtx = baseCanvas.getContext('2d');
  baseCtx.globalCompositeOperation = 'source-atop';
  baseCtx.putImageData(base, 0, 0);
  baseCtx.drawImage(overlayCanvas, 0, 0);

  return baseCtx.getImageData(0, 0, base.width, base.height);
}
