import { Rect, RgbaImageData } from '@votingworks/types';
import { createImageData, RGBA_CHANNEL_COUNT } from './image_data';

/**
 * Returns a new image cropped to the specified bounds.
 */
export function crop(imageData: RgbaImageData, bounds: Rect): RgbaImageData {
  const { data: src, width: srcWidth } = imageData;
  const {
    x: srcOffsetX,
    y: srcOffsetY,
    width: dstWidth,
    height: dstHeight,
  } = bounds;
  const dstImageData = createImageData(dstWidth, dstHeight);
  const dst = dstImageData.data;

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

  return dstImageData;
}
