import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import { getImageChannelCount } from './image_data';

/**
 * Returns a new image cropped to the specified bounds.
 */
export function crop(imageData: ImageData, bounds: Rect): ImageData {
  const { data: src, width: srcWidth } = imageData;
  const channels = getImageChannelCount(imageData);
  const dst = new Uint8ClampedArray(bounds.width * bounds.height * channels);
  const {
    x: srcOffsetX,
    y: srcOffsetY,
    width: dstWidth,
    height: dstHeight,
  } = bounds;

  for (let y = 0; y < dstHeight; y += 1) {
    const srcOffset = (srcOffsetY + y) * srcWidth + srcOffsetX;
    const dstOffset = y * dstWidth;
    dst.set(
      src.subarray(srcOffset * channels, (srcOffset + dstWidth) * channels),
      dstOffset * channels
    );
  }

  return createImageData(dst, dstWidth, dstHeight);
}
