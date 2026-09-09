import { createImageData } from './image_data';

/**
 * ImageData for a 1x1 image for use in tests that mock a blank page.
 */
export const BLANK_PAGE_IMAGE_DATA = createImageData(
  new Uint8ClampedArray([0, 0, 0, 255]),
  1,
  1
);
