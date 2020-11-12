import { basename, dirname, extname, join } from 'path'

/**
 * Gets the path to a file adjacent to this one.
 *
 * @example
 *
 */
export function adjacentFile(suffix: string, path: string): string {
  const dir = dirname(path)
  const ext = extname(path)
  const base = basename(path, ext)
  return join(dir, base + suffix + ext)
}
