import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { err, ok, Result } from '@votingworks/basics';
import { exchangePaths, syncFilesystem } from '@votingworks/fs';
import { SwapBackupOptions } from './types.js';

/**
 * Possible expected errors that might occur during {@link swap}.
 */
export type SwapError =
  | {
      type: 'backup-swap-failed';
      message: string;
    }
  | {
      type: 'backup-flush-failed';
      message: string;
    };

/**
 * Moves a finished backup into its final location, replacing whatever backup
 * was already there and discarding the leftovers.
 */
export async function swap(
  options: SwapBackupOptions
): Promise<Result<void, SwapError>> {
  const { inProgressBackup, backup, target } = options;

  options.onProgressEvent?.({ type: 'flushing_backup' });
  const flushBeforeSwapResult = await syncFilesystem(target);
  if (flushBeforeSwapResult.isErr()) {
    return err({
      type: 'backup-flush-failed',
      message: `Failed to flush the backup to the target: ${
        flushBeforeSwapResult.err().message
      }`,
    });
  }

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

  options.onProgressEvent?.({ type: 'flushing_backup' });
  const flushAfterSwapResult = await syncFilesystem(target);
  if (flushAfterSwapResult.isErr()) {
    return err({
      type: 'backup-flush-failed',
      message: `Failed to flush the swapped-in backup: ${
        flushAfterSwapResult.err().message
      }`,
    });
  }

  return ok();
}
