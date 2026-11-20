import type {
  GrayImageData,
  ImageData,
  Rect,
  RgbaImageData,
} from '@votingworks/types';
import {
  createGrayImageData,
  createImageData,
  getImageChannelCount,
  isRgba,
} from './image_data.js';

/**
 * Returns a new grayscale image cropped to the specified bounds.
 */
export function crop(imageData: GrayImageData, bounds: Rect): GrayImageData;

/**
 * Returns a new image cropped to the specified bounds.
 */
export function crop(imageData: RgbaImageData, bounds: Rect): RgbaImageData;

/**
 * Returns a new image cropped to the specified bounds.
 */
export function crop(imageData: ImageData, bounds: Rect): ImageData {
  const { data: src, width: srcWidth } = imageData;
  const {
    x: srcOffsetX,
    y: srcOffsetY,
    width: dstWidth,
    height: dstHeight,
  } = bounds;
  const channels = getImageChannelCount(imageData);
  const dstImageData = isRgba(imageData)
    ? createImageData(dstWidth, dstHeight)
    : createGrayImageData(dstWidth, dstHeight);
  const dst = dstImageData.data;

  for (let y = 0; y < dstHeight; y += 1) {
    const srcOffset = (srcOffsetY + y) * srcWidth + srcOffsetX;
    const dstOffset = y * dstWidth;
    dst.set(
      src.subarray(srcOffset * channels, (srcOffset + dstWidth) * channels),
      dstOffset * channels
    );
  }

  return dstImageData;
}
