import { ImageData } from 'canvas';
/**
 * Rotates an ImageData object 180 degrees.
 */
export function rotateImageData180(imageData: ImageData): ImageData {
  const { width, height } = imageData;
  const output = new ImageData(width, height);
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i += 1) {
    // Calculate the x and y position of the current pixel
    const x = i % width;
    const y = Math.floor(i / width);

    // Calculate the new position for the current pixel
    const newX = width - 1 - x;
    const newY = height - 1 - y;
    const newIndex = newY * width + newX;

    // Copy the pixel data from the original image to the new position in the output image
    output.data[newIndex * 4] = imageData.data[i * 4] || 0; // R
    output.data[newIndex * 4 + 1] = imageData.data[i * 4 + 1] || 0; // G
    output.data[newIndex * 4 + 2] = imageData.data[i * 4 + 2] || 0; // B
    output.data[newIndex * 4 + 3] = imageData.data[i * 4 + 3] || 0; // A
  }

  return output;
}
