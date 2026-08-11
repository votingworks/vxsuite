import { ImageData } from 'canvas';
import { napi } from './napi';

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
 * Runs a diagnostic on in-memory blank paper image data to determine if it is
 * a valid ballot. Accepts either grayscale (one byte per pixel) or RGBA image
 * data, as scanner clients emit grayscale.
 */
export async function runBlankPaperDiagnosticFromImage(
  image: ImageData,
  debugBasePath?: string
): Promise<boolean> {
  return napi.runBlankPaperDiagnosticFromImage(
    image.width,
    image.height,
    image.data,
    debugBasePath
  );
}
