import { error } from 'node:console';
import { rmSync } from 'fs-extra';
import { resolve, dirname, basename } from 'node:path';
import { readdirSync } from 'node:fs';

let tmpFiles: string[] = [];
const PRINTED_TEST_ARTIFACT_PREFIX = '/tmp/mock-print-job-';

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
  for (const tmpFile of [...tmpFiles, PRINTED_TEST_ARTIFACT_PREFIX]) {
    const dir = dirname(tmpFile);
    const base = basename(tmpFile);
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (file.startsWith(base)) {
          rmSync(resolve(dir, file), { recursive: true, force: true });
        }
      }
    } catch (e) {
      // ignore errors
    }
  }
  tmpFiles = [];
}
