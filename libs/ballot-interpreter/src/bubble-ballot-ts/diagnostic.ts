import { ImageData } from 'canvas';
import { napi } from './napi';

/**
 * Runs a diagnostic on a blank paper image to determine if it is a valid
 * ballot. Accepts either a path to an image file or decoded `ImageData`
 * (e.g. from a scanner that streams image data rather than writing files).
 */
export async function runBlankPaperDiagnostic(
  image: string | ImageData,
  debugBasePath?: string
): Promise<boolean> {
  if (typeof image === 'string') {
    return napi.runBlankPaperDiagnosticFromPath(image, debugBasePath);
  }
  return napi.runBlankPaperDiagnosticFromImage(
    image.width,
    image.height,
    image.data,
    debugBasePath
  );
}
