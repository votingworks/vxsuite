import { basename, dirname, extname, join } from 'path'

/**
 * Gets the path to a file adjacent to this one.
 *
 * @example
 *
 */
export function adjacentFile(
  suffix: string,
  path: string,
  ext = extname(path)
): string {
  const dir = dirname(path)
  const base = basename(path, extname(path))
  return join(dir, base + suffix + ext)
}
