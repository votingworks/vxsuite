import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { err, ok, Result } from '@votingworks/basics';
import { exchangePaths } from '@votingworks/fs';
import { SwapBackupOptions } from './types.js';

/**
 * Possible expected errors that might occur during {@link swap}.
 */
export interface SwapError {
  type: 'backup-swap-failed';
  message: string;
}

/**
 * Moves a finished backup into its final location, replacing whatever backup
 * was already there and discarding the leftovers.
 */
export async function swap(
  options: SwapBackupOptions
): Promise<Result<void, SwapError>> {
  const { inProgressBackup, backup } = options;
  options.onProgressEvent?.({ type: 'swapping_backup' });

  if (existsSync(backup)) {
    const exchangeResult = exchangePaths(backup, inProgressBackup);
    if (exchangeResult.isErr()) {
      return err({
        type: 'backup-swap-failed',
        message: `Failed to swap in the new backup: ${
          exchangeResult.err().message
        }`,
      });
    }
  } else {
    await rename(inProgressBackup, backup);
  }

  await rm(inProgressBackup, { recursive: true, force: true });

  return ok();
}
