import { createImageData } from 'canvas';
import { getImageChannelCount } from './image_data';
import { otsu } from './otsu';

/**
 * Binarizes an image by thresholding it at a given value. Assumes that the
 * image is grayscale, even if it's stored as RGBA.
 */
export function binarize(
  image: ImageData,
  threshold = otsu(image.data, getImageChannelCount(image))
): ImageData {
  const channels = getImageChannelCount(image);
  const { data, width, height } = image;
  const result = createImageData(
    new Uint8ClampedArray(data.length),
    width,
    height
  );

  for (let offset = 0, { length } = data; offset < length; offset += channels) {
    const lum = data[offset] as number;
    const binarized = lum > threshold ? 255 : 0;

    if (channels === 1) {
      result.data[offset] = binarized;
    } else if (channels === 4) {
      result.data[offset] = binarized;
      result.data[offset + 1] = binarized;
      result.data[offset + 2] = binarized;
      result.data[offset + 3] = 255;
    }
  }

  return result;
}
