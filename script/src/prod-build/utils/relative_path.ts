import { isAbsolute, relative } from 'node:path';

export function relativePath(path: string, { from }: { from: string }): string {
  if (isAbsolute(path)) {
    return relative(from, path);
  } else {
    return path;
  }
}
