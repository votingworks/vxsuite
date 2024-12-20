import assert from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

let temporaryRootDir: string | undefined;

/**
 * Sets the temporary root directory for fixtures.
 *
 * @throws If the temporary root directory has already been set.
 */
export function setTemporaryRootDir(path: string): void {
  assert(
    temporaryRootDir === undefined,
    'Temporary root directory already set; call clearTemporaryRootDir first'
  );
  temporaryRootDir = path;
}

/**
 * Creates unique directory for fixtures and sets it as the temporary root
 * directory with {@link setTemporaryRootDir}.
 *
 * @throws If the temporary root directory has already been set.
 */
export function setupTemporaryRootDir(): void {
  assert(
    temporaryRootDir === undefined,
    'Temporary root directory already set; call clearTemporaryRootDir first'
  );
  const rootDir = join(tmpdir(), `vx-fixtures-${Date.now()}-${process.pid}`);
  mkdirSync(rootDir, { recursive: true });
  setTemporaryRootDir(rootDir);
}

/**
 * Returns the temporary root directory for fixtures.
 *
 * @throws If the temporary root directory has not been set.
 */
export function getTemporaryRootDir(): string {
  assert(
    temporaryRootDir !== undefined,
    'Temporary root directory not set; call setupTemporaryRootDir first. Hint: is the call in your test happening before `beforeAll`?'
  );
  return temporaryRootDir;
}

/**
 * Deletes the temporary root directory for fixtures and unsets it. If the
 * temporary root directory has not been set, this function does nothing.
 */
export function clearTemporaryRootDir(): void {
  if (temporaryRootDir) {
    rmSync(temporaryRootDir, { recursive: true, force: true });
  }
  temporaryRootDir = undefined;
}

/**
 * Returns the path for a file within the temporary root directory for fixtures.
 *
 * @param filePath - The path of the file relative to the temporary root directory,
 *                   must not start with "/" or "..".
 */
export function getPathForFile(filePath: string): string {
  assert(
    temporaryRootDir !== undefined,
    'Temporary root directory not set; call setupTemporaryRootDir first. Hint: is the call in your test happening before `beforeAll`?'
  );
  const normalizedFilePath = normalize(filePath);
  assert(!normalizedFilePath.startsWith('/'), 'File path must be relative');
  assert(
    !normalizedFilePath.startsWith('..'),
    'File path must not start with ".."'
  );
  return join(temporaryRootDir, filePath);
}
