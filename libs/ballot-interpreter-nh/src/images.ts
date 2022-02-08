import { createCanvas, loadImage } from 'canvas';

/**
 * Reads an image in grayscale from a file and scales or resizes to fit if
 * desired. If scaling/resizing, returns the scale that ended up being used
 * when resizing along with the scaled image and the original one. This is
 * useful if you want to compute something based on the scaled image but
 * draw an overlay on the original image, as the `lsd` binary does.
 */
export async function readGrayscaleImage(path: string): Promise<ImageData> {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, image.width, image.height);
  context.drawImage(image, 0, 0, image.width, image.height);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  const src32 = new Int32Array(imageData.data.buffer);
  const dst = new Uint8ClampedArray(image.width * image.height);

  for (let offset = 0, { length } = src32; offset < length; offset += 1) {
    const px = src32[offset] as number;
    const r = px & 0xff;
    const g = (px >>> 8) & 0xff;
    const b = (px >>> 16) & 0xff;

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0;
    dst[offset] = luminosity;
  }

  return {
    data: dst,
    width: imageData.width,
    height: imageData.height,
  };
}
