import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
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

/** Format a byte count for human-readable display. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

/**
 * Remove a file or directory, ignoring errors.
 * Uses `rm` with `force: true` (which handles missing paths) and additionally
 * catches unexpected errors like permission issues, logging them via debug.
 */
export async function cleanupSafe(
  path: string,
  options: { recursive?: boolean } = {}
): Promise<void> {
  try {
    await rm(path, { force: true, ...options });
  } catch {
    debug('failed to clean up %s', path);
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

/**
 * Copy a file while computing its SHA256 hash. Returns the hash and size.
 */
export async function copyFileWithHash(
  src: string,
  dest: string
): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256');
  const fileStat = await stat(src);

  await pipeline(
    createReadStream(src),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(dest)
  );

  return { sha256: hash.digest('hex'), size: fileStat.size };
}
