import { isAbsolute, join } from 'path'

/**
 * Joins path parts by using the last absolute path, if any, and joining
 * all the following parts, normalizing the result.
 */
export function normalizeAndJoin(path: string, ...parts: string[]): string {
  let result = path

  for (const part of parts) {
    if (isAbsolute(part)) {
      result = part
    } else {
      result = join(result, part)
    }
  }

  return result
}
