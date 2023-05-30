import { removeSync } from 'fs-extra';
import { dirSync } from 'tmp';

const tmpPaths: string[] = [];

/**
 * Creates a temporary directory.
 */
export function tmpDir(): string {
  const dir = dirSync().name;
  tmpPaths.push(dir);
  return dir;
}

afterAll(() => {
  for (const path of tmpPaths) {
    removeSync(path);
  }
});
