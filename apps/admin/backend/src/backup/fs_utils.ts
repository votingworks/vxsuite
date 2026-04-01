import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import makeDebug from 'debug';
import { safeParseNumber } from '@votingworks/types';

const debug = makeDebug('admin:backup:fs');

/**
 * Get available disk space in bytes at the given path using `df`.
 * Returns 0 if the check fails (e.g. on unusual filesystems).
 */
export function getAvailableDiskSpace(path: string): number {
  try {
    const output = execFileSync('df', ['-B1', '--output=avail', path], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const lines = output.trim().split('\n');
    return safeParseNumber(lines[1]?.trim() ?? '0').unsafeUnwrap();
  } catch {
    return 0;
  }
}

/** Format a byte count for display in error messages. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${bytes} bytes`;
}

/** Remove a file, ignoring errors. */
export async function cleanupSafe(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    debug('failed to clean up %s', filePath);
  }
}

/** Remove a directory recursively, ignoring errors. */
export async function cleanupDirSafe(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    debug('failed to clean up directory %s', dirPath);
  }
}

/**
 * Call an async function and return its result, or return `undefined` if
 * the operation fails with ENOENT. All other errors are rethrown.
 */
export async function ignoreMissing<T>(
  promise: Promise<T>
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
