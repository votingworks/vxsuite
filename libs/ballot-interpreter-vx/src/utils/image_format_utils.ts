import {
  getImageChannelCount,
  isGrayscale,
  isRgba,
} from '@votingworks/image-utils';
import { Size } from '@votingworks/types';
import { assert, fail } from '@votingworks/utils';

export type InPlaceImageTransform<A extends unknown[], R> = (
  srcImageData: ImageData,
  dstImageData?: ImageData,
  ...args: A
) => R;

export function makeInPlaceImageTransform<A extends unknown[], R>(
  gray: InPlaceImageTransform<A, R>,
  rgba: InPlaceImageTransform<A, R>
): InPlaceImageTransform<A, R> {
  return (srcImageData: ImageData, dstImageData?: ImageData, ...args: A): R => {
    const channels = getImageChannelCount(srcImageData);

    switch (channels) {
      case 1:
        return gray(srcImageData, dstImageData, ...args);

      case 4:
        return rgba(srcImageData, dstImageData, ...args);

      default:
        throw new Error(`unexpected ${channels}-channel image`);
    }
  };
}

export type ImageTransform<A extends unknown[], R> = (
  imageData: ImageData,
  ...args: A
) => R;

export function makeImageTransform<A extends unknown[], R>(
  gray: ImageTransform<A, R>,
  rgba: ImageTransform<A, R>
): ImageTransform<A, R> {
  return (imageData: ImageData, ...args: A): R => {
    const channels = getImageChannelCount(imageData);

    switch (channels) {
      case 1:
        return gray(imageData, ...args);

      case 4:
        return rgba(imageData, ...args);

      default:
        throw new Error(`unexpected ${channels}-channel image`);
    }
  };
}

export function assertRgbaImage(imageData: ImageData): void {
  assert(
    imageData.data.length === imageData.width * imageData.height * 4,
    'expected 4-channel RGBA image'
  );
}

export function assertGrayscaleImage(imageData: ImageData): void {
  assert(
    imageData.data.length === imageData.width * imageData.height,
    'expected 1-channel grayscale image'
  );
}

export function assertRgbaOrGrayscaleImage(imageData: ImageData): void {
  if (!isRgba(imageData) && !isGrayscale(imageData)) {
    fail('expected 1-channel grayscale or 4-channel RGBA image');
  }
}

export function assertImageChannelsMatch(
  imageData1: ImageData,
  imageData2: ImageData
): void {
  assert(
    getImageChannelCount(imageData1) === getImageChannelCount(imageData2),
    'expected images to have the same number of channels'
  );
}

export function assertSizesMatch(size1: Size, size2: Size): void {
  assert(
    size1.width === size2.width && size1.height === size2.height,
    'expected sizes to be equal'
  );
}
