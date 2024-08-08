import { ImageData } from 'canvas';

/**
 * ImageData for a 1x1 image for use in tests that mock a blank page.
 */
export const BLANK_PAGE_IMAGE_DATA = new ImageData(
  new Uint8ClampedArray([0, 0, 0, 255]),
  1,
  1
);
