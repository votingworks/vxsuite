/*
 * NOTE: This is copied from `find_scanned_document_inset` in Rust and is not
 * intended to be used long-term. Instead, we will replace the TypeScript
 * interpretation for summary ballots with the Rust version.
 */

import { Optional } from '@votingworks/basics';
import { RGBA_CHANNEL_COUNT } from '@votingworks/image-utils';
import { ImageData } from '@votingworks/types';

export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * This sets the ratio of pixels required to be white (above the threshold) in
 * a given edge row or column to consider it no longer eligible to be cropped.
 * This used to be 50%, but we found that too much of the top/bottom of the
 * actual ballot content was being cropped, especially in the case of a skewed
 * ballot. In such cases, one of the corners would sometimes be partially or
 * completely cropped, leading to the ballot being rejected. We chose the new
 * value by trial and error, in particular by seeing how much cropping occurred
 * on ballots with significant but still acceptable skew (i.e. 3 degrees).
 */
export const CROP_BORDERS_THRESHOLD_RATIO: number = 0.1;

/* eslint-disable vx/gts-identifiers */

/**
 * Finds the inset of a scanned document in an image such that each side of the
 * inset has more than `CROP_BORDERS_THRESHOLD_RATIO` of its pixels above the
 * given threshold.
 */
export function findScannedDocumentInset(
  image: ImageData,
  threshold: number
): Optional<Inset> {
  const { width, height } = image;
  const maxX = width - 1;
  const maxY = height - 1;

  const rowCropThreshold = width * CROP_BORDERS_THRESHOLD_RATIO;
  const columnCropThreshold = height * CROP_BORDERS_THRESHOLD_RATIO;
  const rowStride = RGBA_CHANNEL_COUNT * width;
  const columnStride = RGBA_CHANNEL_COUNT;

  let minYAboveThreshold: Optional<number>;
  let maxYAboveThreshold: Optional<number>;
  let minXAboveThreshold: Optional<number>;
  let maxXAboveThreshold: Optional<number>;

  for (
    let y = 0, offset = 0;
    y < height && typeof minYAboveThreshold === 'undefined';
    y += 1
  ) {
    let pixelsAboveThreshold = 0;
    for (let x = 0; x < width; x += 1, offset += columnStride) {
      if ((image.data[offset] as number) > threshold) {
        pixelsAboveThreshold += 1;

        if (pixelsAboveThreshold > rowCropThreshold) {
          minYAboveThreshold = y;
          break;
        }
      }
    }
  }

  for (
    let y = height - 1, offset = image.data.length - columnStride;
    y >= 0 && typeof maxYAboveThreshold === 'undefined';
    y -= 1
  ) {
    let pixelsAboveThreshold = 0;
    for (let x = 0; x < width; x += 1, offset -= columnStride) {
      if ((image.data[offset] as number) > threshold) {
        pixelsAboveThreshold += 1;

        if (pixelsAboveThreshold > rowCropThreshold) {
          maxYAboveThreshold = y;
          break;
        }
      }
    }
  }

  for (
    let x = 0, offset = 0;
    x < width && typeof minXAboveThreshold === 'undefined';
    x += 1, offset = x * columnStride
  ) {
    let pixelsAboveThreshold = 0;
    for (let y = 0; y < height; y += 1, offset += rowStride) {
      if ((image.data[offset] as number) > threshold) {
        pixelsAboveThreshold += 1;

        if (pixelsAboveThreshold > columnCropThreshold) {
          minXAboveThreshold = x;
          break;
        }
      }
    }
  }

  for (
    let x = width - 1, offset = rowStride - columnStride;
    x >= 0 && typeof maxXAboveThreshold === 'undefined';
    x -= 1, offset = x * columnStride
  ) {
    let pixelsAboveThreshold = 0;
    for (let y = 0; y < height; y += 1, offset += rowStride) {
      if ((image.data[offset] as number) > threshold) {
        pixelsAboveThreshold += 1;

        if (pixelsAboveThreshold > columnCropThreshold) {
          maxXAboveThreshold = x;
          break;
        }
      }
    }
  }

  if (
    typeof minXAboveThreshold === 'number' &&
    typeof minYAboveThreshold === 'number' &&
    typeof maxXAboveThreshold === 'number' &&
    typeof maxYAboveThreshold === 'number'
  ) {
    return {
      top: minYAboveThreshold,
      bottom: maxY - maxYAboveThreshold,
      left: minXAboveThreshold,
      right: maxX - maxXAboveThreshold,
    };
  }

  return undefined;
}
