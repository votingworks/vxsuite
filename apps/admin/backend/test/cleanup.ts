import { error } from 'node:console';
import { rmSync } from 'fs-extra';
import { resolve } from 'node:path';

let tmpFiles: string[] = [];

const tmpFileRegex = /^\/tmp\/.+/;

export function deleteTmpFileAfterTestSuiteCompletes(path: string): void {
  if (!tmpFileRegex.test(resolve(path))) {
    throw error(
      'only files under the /tmp directory can be automatically cleaned up'
    );
  }
  tmpFiles.push(path);
}

export function cleanupTestSuiteTmpFiles(): void {
  for (const tmpFile of tmpFiles) {
    rmSync(tmpFile, { recursive: true, force: true });
  }
  tmpFiles = [];
}
