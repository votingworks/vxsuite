import { runBlankPaperDiagnostic as runBlankPaperDiagnosticImpl } from './addon';

/**
 * Runs a diagnostic on a blank paper image to determine if it is a valid
 * ballot.
 */
export function runBlankPaperDiagnostic(
  imagePath: string,
  debugBasePath?: string
): boolean {
  return runBlankPaperDiagnosticImpl(imagePath, debugBasePath);
}
