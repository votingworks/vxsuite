import { dirname, isAbsolute, join } from 'path';

/**
 * Resolves a relative path to an absolute path based on the given source file.
 */
export function resolvePath(sourcePath: string, relativePath: string): string {
  return isAbsolute(relativePath)
    ? relativePath
    : join(dirname(sourcePath), relativePath);
}
