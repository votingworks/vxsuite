import { Rect } from '@votingworks/types';

/**
 * Alias for `number` type, meant to be used where an integer is expected.
 * Exists purely for documentation and does not prevent using `number` instead.
 */
export type int = number;

/**
 * Alias for `number` type, meant to be used where a floating-point number is
 * expected. Exists purely for documentation and does not prevent using `number`
 * instead.
 */
export type float = number;

/**
 * Alias for `number` type, meant to be used where an 8-bit unsigned integer is
 * expected.  Exists purely for documentation and does not prevent using
 * `number` instead.
 */
export type u8 = number;

/**
 * Alias for `number` type, meant to be used where an array index or length is
 * expected.  Exists purely for documentation and does not prevent using
 * `number` instead.
 */
export type usize = number;

/**
 * A grayscale image.
 */
export interface GrayImage {
  /**
   * The number of channels in the image. For grayscale images, this is 1.
   */
  readonly channels: 1;

  /**
   * The number of elements to skip to get to the next pixel. For grayscale images,
   * this is 1.
   */
  readonly step: 1;

  /**
   * The width of the image in pixels.
   */
  readonly width: usize;

  /**
   * The height of the image in pixels.
   */
  readonly height: usize;

  /**
   * How many pixels are in this image.
   */
  readonly length: usize;

  /**
   * Gets the value of the pixel at the given offset.
   */
  raw(offset: usize): u8;

  /**
   * Reads the value of the pixel at the given coordinates.
   */
  at(x: usize, y: usize): u8;

  /**
   * Reads the pixel values in the given row. The result will have `width`
   * elements.
   */
  row(y: usize): ArrayLike<u8>;

  /**
   * Sets the value of the pixel at the given offset.
   */
  setRaw(offset: usize, value: u8): void;

  /**
   * Sets the value of the pixel at the given coordinates.
   */
  setAt(x: usize, y: usize, value: u8): void;

  /**
   * Returns false.
   */
  isRgba(): this is RgbaImage;

  /**
   * Returns true.
   */
  isGray(): this is GrayImage;

  /**
   * Returns this image stored as RGBA.
   */
  toRgba(): RgbaImage;

  /**
   * Returns this.
   */
  toGray(): GrayImage;

  /**
   * Binaries this image using the given threshold. If no threshold is given,
   * Otsu's method is used to determine the threshold.
   */
  binarize(threshold?: u8): GrayImage;

  /**
   * Converts this image to an `ImageData` object.
   */
  asImageData(): ImageData;

  /**
   * Converts this image to a data URL.
   */
  asDataUrl(mimeType: string): string;

  /**
   * Outline pixels of a certain color with the same color.
   */
  outline(options: { color: u8 }): GrayImage;

  /**
   * Crop the image to the given rectangle.
   */
  crop(rect: Rect): GrayImage;

  /**
   * Determines number of pixels of a color in an image.
   */
  count(options: { color: u8; bounds?: Rect }): int;

  /**
   * Generates an image from two images where corresponding pixels in `compare`
   * that are darker than their counterpart in `base` show up with the luminosity
   * difference between the two.  `compare` is black and `base` is not. This is
   * useful for determining where a light-background form was filled out, for
   * example.
   *
   * Note that the sizes of the bounds, which default to the full image size, must
   * be equal.
   *
   * ```
   *         BASE                  COMPARE                 DIFF
   * ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
   * │                   │  │        █ █ ███    │  │        █ █ ███    │
   * │ █ █               │  │ █ █    ███  █     │  │        ███  █     │
   * │  █                │  │  █     █ █ ███    │  │        █ █ ███    │
   * │ █ █ █████████████ │  │ █ █ █████████████ │  │                   │
   * └───────────────────┘  └───────────────────┘  └───────────────────┘
   * ```
   */
  diff(compare: GrayImage, baseBounds?: Rect, compareBounds?: Rect): GrayImage;

  /**
   * Creates a copy of this image.
   */
  copy(): GrayImage;

  /**
   * Fills the image with the given color.
   */
  fill(color: u8): this;

  /**
   * Rotate the image by 180 degrees.
   */
  rotate180(): GrayImage;
}

/**
 * An RGBA image.
 */
export interface RgbaImage {
  /**
   * The number of channels in the image. For RGBA images, this is 4.
   */
  readonly channels: 4;

  /**
   * The number of elements to skip to get to the next pixel. For RGBA images,
   * this is 4.
   */
  readonly step: 4;

  /**
   * The width of the image in pixels.
   */
  readonly width: number;

  /**
   * The height of the image in pixels.
   */
  readonly height: number;

  /**
   * How many pixels are in this image.
   */
  readonly length: usize;

  /**
   * Gets the value of the pixel at the given offset. Assumes the image is
   * actually grayscale stored as RGBA.
   */
  raw(offset: usize): u8;

  /**
   * Reads the value of the pixel at the given coordinates. Assumes the image
   * is actually grayscale stored as RGBA.
   */
  at(x: number, y: number): number;

  /**
   * Reads the pixel values in the given row. The result will have `width * 4`
   * elements.
   */
  row(y: number): ArrayLike<number>;

  /**
   * Sets the value of the pixel at the given offset. Assumes the image is
   * actually grayscale stored as RGBA.
   */
  setRaw(offset: usize, value: u8): void;

  /**
   * Sets the value of the pixel at the given coordinates. Assumes the image is
   * actually grayscale stored as RGBA.
   */
  setAt(x: usize, y: usize, value: u8): void;

  /**
   * Returns true.
   */
  isRgba(): this is RgbaImage;

  /**
   * Returns false.
   */
  isGray(): this is GrayImage;

  /**
   * Returns this.
   */
  toRgba(): RgbaImage;

  /**
   * Returns a grayscale version of this image.
   */
  toGray(): GrayImage;

  /**
   * Binaries this image using the given threshold. If no threshold is given,
   * Otsu's method is used to determine the threshold.
   */
  binarize(threshold?: u8): GrayImage;

  /**
   * Converts this image to an `ImageData` object.
   */
  asImageData(): ImageData;

  /**
   * Converts this image to a data URL.
   */
  asDataUrl(mimeType: string): string;

  /**
   * Crop the image to the given rectangle.
   */
  crop(rect: Rect): RgbaImage;

  /**
   * Creates a copy of this image.
   */
  copy(): RgbaImage;

  /**
   * Rotate the image by 180 degrees.
   */
  rotate180(): RgbaImage;
}

/**
 * Either a grayscale or RGBA image.
 */
export type AnyImage = GrayImage | RgbaImage;
