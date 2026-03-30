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
