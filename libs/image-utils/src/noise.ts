import { createImageData } from 'canvas';
import { getImageChannelCount } from './image_data';
import { PIXEL_BLACK, PIXEL_WHITE } from './diff';

/**
 * Removes noise from a binarized image by removing pixels without a NSEW
 * neighbor. Assumes that the image is grayscale, even if it's stored as RGBA.
 */
export function simpleRemoveNoise(
  image: ImageData,
  foreground: typeof PIXEL_BLACK | typeof PIXEL_WHITE,
  minimumNeighbors: 0 | 1 | 2 | 3 | 4 = 1
): ImageData {
  const channels = getImageChannelCount(image);
  const background = 255 - foreground;
  const { data, width, height } = image;
  const result = createImageData(
    new Uint8ClampedArray(data.length),
    width,
    height
  );

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += channels) {
      const lum = data[offset] as number;
      if (lum === foreground) {
        const n = data[offset - width * channels] as number;
        const s = data[offset + width * channels] as number;
        const e = data[offset + channels] as number;
        const w = data[offset - channels] as number;

        const neighbors =
          (n === foreground ? 1 : 0) +
          (s === foreground ? 1 : 0) +
          (e === foreground ? 1 : 0) +
          (w === foreground ? 1 : 0);
        const isNoise = neighbors < minimumNeighbors;
        const resultLum = isNoise ? background : foreground;

        result.data[offset] = resultLum;
        if (channels === 4) {
          result.data[offset + 1] = resultLum;
          result.data[offset + 2] = resultLum;
          result.data[offset + 3] = 255;
        }
      } else {
        result.data[offset] = lum;
        if (channels === 4) {
          result.data[offset + 1] = lum;
          result.data[offset + 2] = lum;
          result.data[offset + 3] = 255;
        }
      }
    }
  }

  return result;
}
