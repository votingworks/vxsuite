import assert from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

let temporaryRootDir: string | undefined;

export function setTemporaryRootDir(path: string): void {
  assert(
    temporaryRootDir === undefined,
    'Temporary root directory already set; call clearTemporaryRootDir first'
  );
  temporaryRootDir = path;
}

export function setupTemporaryRootDir(): void {
  assert(
    temporaryRootDir === undefined,
    'Temporary root directory already set; call clearTemporaryRootDir first'
  );
  const rootDir = join(tmpdir(), `vx-fixtures-${Date.now()}-${process.pid}`);
  mkdirSync(rootDir, { recursive: true });
  setTemporaryRootDir(rootDir);
}

export function getTemporaryRootDir(): string {
  assert(
    temporaryRootDir !== undefined,
    'Temporary root directory not set; call setupTemporaryRootDir first'
  );
  return temporaryRootDir;
}

export function clearTemporaryRootDir(): void {
  if (temporaryRootDir) {
    rmSync(temporaryRootDir, { recursive: true, force: true });
  }
  temporaryRootDir = undefined;
}

export function getPathForFile(filePath: string): string {
  assert(
    temporaryRootDir !== undefined,
    'Temporary root directory not set; call setupTemporaryRootDir first'
  );
  const normalizedFilePath = normalize(filePath);
  assert(!normalizedFilePath.startsWith('/'), 'File path must be relative');
  assert(
    !normalizedFilePath.startsWith('..'),
    'File path must not start with ".."'
  );
  return join(temporaryRootDir, filePath);
}
