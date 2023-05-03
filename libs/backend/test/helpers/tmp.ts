import { removeSync, writeFileSync } from 'fs-extra';
import { dirSync, fileSync } from 'tmp';

const tmpPaths: string[] = [];

/**
 * Creates a temporary directory.
 */
export function tmpDir(): string {
  const dir = dirSync().name;
  tmpPaths.push(dir);
  return dir;
}

/**
 * Creates a temporary file with the given data.
 */
export function tmpFileWithData(data: string | NodeJS.ArrayBufferView): string {
  const file = fileSync();
  writeFileSync(file.name, data);
  tmpPaths.push(file.name);
  return file.name;
}

afterAll(() => {
  for (const path of tmpPaths) {
    removeSync(path);
  }
});
