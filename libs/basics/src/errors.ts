/**
 * Extracts the error message from an error in a type-safe way
 */
export function extractErrorMessage(error: unknown): string {
  return (
    (error as { message?: string }).message ??
    (error as { stack?: string }).stack ??
    String(error)
  );
}

/**
 * Determines whether an error is a Node fs module non-existent file or directory error
 */
export function isNonExistentFileOrDirectoryError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
