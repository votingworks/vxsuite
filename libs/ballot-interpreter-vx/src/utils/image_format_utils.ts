import { assert } from '@votingworks/basics';
import { getImageChannelCount } from '@votingworks/image-utils';
import { Size } from '@votingworks/types';

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

export function assertSizesMatch(size1: Size, size2: Size): void {
  assert(
    size1.width === size2.width && size1.height === size2.height,
    'expected sizes to be equal'
  );
}
