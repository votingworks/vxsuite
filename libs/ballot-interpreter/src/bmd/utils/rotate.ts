import { ImageData } from 'canvas';
/**
 * Rotate an image 180 degrees in place.
 */
export function rotateImageData180(imageData: ImageData): void {
  const { data } = imageData;
  const channels = 4;

  for (
    let head = 0, tail = data.length - channels;
    head < tail;
    head += channels, tail -= channels
  ) {
    const r = data[head] as number;
    data[head] = data[tail] as number;
    data[tail] = r;

    const g = data[head + 1] as number;
    data[head + 1] = data[tail + 1] as number;
    data[tail + 1] = g;

    const b = data[head + 2] as number;
    data[head + 2] = data[tail + 2] as number;
    data[tail + 2] = b;

    const a = data[head + 3] as number;
    data[head + 3] = data[tail + 3] as number;
    data[tail + 3] = a;
  }
}
