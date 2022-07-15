import { getImageChannelCount } from './image_data';

/**
 * Rotate an image 180 degrees in place.
 *
 * This function is not exactly fast, but it is faster than using 'canvas'
 * because of the cost of creating an `Image` from the `ImageData`, drawing it
 * to a temporary canvas, and then copying the pixels back to the `ImageData`.
 */
export function rotate180(imageData: ImageData): void {
  const { data } = imageData;
  const channels = getImageChannelCount(imageData);

  for (
    let head = 0, tail = data.length - channels;
    head < tail;
    head += channels, tail -= channels
  ) {
    for (let i = 0; i < channels; i += 1) {
      const temp = data[head + i] as number;
      data[head + i] = data[tail + i] as number;
      data[tail + i] = temp;
    }
  }
}
