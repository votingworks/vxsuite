import { Buffer } from 'buffer';
import { createCanvas, createImageData, loadImage } from 'canvas';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

function ensureImageData(imageData: ImageData): ImageData {
  return createImageData(imageData.data, imageData.width, imageData.height);
}

export async function loadImageData(path: string): Promise<ImageData>;
export async function loadImageData(data: Buffer): Promise<ImageData>;
export async function loadImageData(
  pathOrData: string | Buffer
): Promise<ImageData> {
  const img = await loadImage(pathOrData);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  return context.getImageData(0, 0, img.width, img.height);
}

export async function writeImageData(
  path: string,
  imageData: ImageData
): Promise<void> {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  context.putImageData(ensureImageData(imageData), 0, 0);

  const fileWriter = createWriteStream(path);
  const imageStream = /\.png$/i.test(path)
    ? canvas.createPNGStream()
    : canvas.createJPEGStream();
  await pipeline(imageStream, fileWriter);
}
