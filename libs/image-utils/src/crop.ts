import { assert } from '@votingworks/basics';
import { Rect } from '@votingworks/types';
import { createImageData, ImageData } from 'canvas';
import { RGBA_CHANNEL_COUNT, isRgba } from './image_data';

/**
 * Returns a new image cropped to the specified bounds.
 */
export function crop(imageData: ImageData, bounds: Rect): ImageData {
  const { data: src, width: srcWidth } = imageData;
  assert(isRgba(imageData), 'Image must be RGBA');
  const dst = new Uint8ClampedArray(
    bounds.width * bounds.height * RGBA_CHANNEL_COUNT
  );
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
      src.subarray(
        srcOffset * RGBA_CHANNEL_COUNT,
        (srcOffset + dstWidth) * RGBA_CHANNEL_COUNT
      ),
      dstOffset * RGBA_CHANNEL_COUNT
    );
  }

  return createImageData(dst, dstWidth, dstHeight);
}
