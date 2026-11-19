import type { EncodedImage, ImageData } from '@votingworks/types';
import { napi } from './napi.js';

/**
 * Runs a diagnostic on a blank paper image to determine if it is a valid
 * ballot.
 */
export async function runBlankPaperDiagnostic(
  imagePath: string,
  debugBasePath?: string
): Promise<boolean> {
  return napi.runBlankPaperDiagnosticFromPath(imagePath, debugBasePath);
}

/**
 * Runs a diagnostic on an in-memory blank paper image to determine if it is a
 * valid ballot. Accepts an encoded image, or grayscale (one byte per pixel) or
 * RGBA image data, as scanner clients emit grayscale.
 */
export async function runBlankPaperDiagnosticFromImage(
  image: ImageData | EncodedImage,
  debugBasePath?: string
): Promise<boolean> {
  if ('encoded' in image) {
    return napi.runBlankPaperDiagnosticFromEncoded(
      image.encoded,
      debugBasePath
    );
  }
  return napi.runBlankPaperDiagnosticFromImage(
    image.width,
    image.height,
    image.data,
    debugBasePath
  );
}
