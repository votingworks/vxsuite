import { rm } from 'node:fs/promises';
import { err, extractErrorMessage, ok, type Result } from '@votingworks/basics';
import {
  exchangePaths,
  renameNoReplace,
  syncFilesystem,
} from '@votingworks/fs';
import type { SwapBackupOptions } from './types.js';

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

  options.onProgressEvent?.({ type: '6_flushing_backup' });
  const flushBeforeSwapResult = await syncFilesystem(target);
  if (flushBeforeSwapResult.isErr()) {
    return err({
      type: 'backup-flush-failed',
      message: `Failed to flush the backup to the target: ${
        flushBeforeSwapResult.err().message
      }`,
    });
  }

  options.onProgressEvent?.({ type: '7_swapping_backup' });

  const renameResult = renameNoReplace(inProgressBackup, backup);
  const swapResult =
    renameResult.err()?.code === 'EEXIST'
      ? exchangePaths(backup, inProgressBackup)
      : renameResult;
  if (swapResult.isErr()) {
    return err({
      type: 'backup-swap-failed',
      message: `Failed to swap in the new backup: ${swapResult.err().message}`,
    });
  }

  try {
    await rm(inProgressBackup, { recursive: true, force: true });
  } catch (error) {
    return err({
      type: 'backup-swap-failed',
      message: `Failed to remove the previous backup: ${extractErrorMessage(
        error
      )}`,
    });
  }

  options.onProgressEvent?.({ type: '8_flushing_swap' });
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
