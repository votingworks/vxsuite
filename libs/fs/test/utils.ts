import { afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { tmpNameSync } from 'tmp';

const tmpFilePaths: string[] = [];

function cleanupTmpFiles() {
  for (const path of tmpFilePaths) {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
}

/**
 * Creates a temporary file and returns its path. The file will be deleted when
 * the test suite is finished.
 */
export function makeTmpFile(): string {
  const path = tmpNameSync();
  tmpFilePaths.push(path);
  return path;
}

afterEach(cleanupTmpFiles);
