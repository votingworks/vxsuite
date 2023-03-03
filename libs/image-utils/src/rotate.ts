import { AnyImage } from './types';

/**
 * Rotate an image 180 degrees in place.
 *
 * This function is not exactly fast, but it is faster than using 'canvas'
 * because of the cost of creating an `Image` from the `ImageData`, drawing it
 * to a temporary canvas, and then copying the pixels back to the `ImageData`.
 */
export function rotate180(imageData: AnyImage): void {
  const { length, step } = imageData;

  for (
    let head = 0, tail = length - step;
    head < tail;
    head += step, tail -= step
  ) {
    for (let i = 0; i < step; i += 1) {
      const temp = imageData.raw(head + i);
      imageData.setRaw(head + i, imageData.raw(tail + i));
      imageData.setRaw(tail + i, temp);
    }
  }
}
