/**
 * Extracts the error message from an error in a type-safe way
 */
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
