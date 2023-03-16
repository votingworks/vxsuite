import { tmpdir } from 'os';
import { join } from 'path';
import * as fs from 'fs';

/**
 * Subdirectory of `/tmp` where fixtures will be copied as tmp files. This
 * constant must match the constant of the same name in `res-to-ts`.
 */
const COPIED_FIXTURES_ROOT = 'copied-fixtures';
export function cleanupCopiedFixtures(): void {
  fs.rmSync(join(tmpdir(), COPIED_FIXTURES_ROOT), {
    recursive: true,
    force: true,
  });
}
