import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  err,
  extractErrorMessage,
  iter,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { copyFile } from '@votingworks/fs';
import { AuthenticatedBackup } from '../authenticated_backup.js';
import { BACKUP_WORKSPACE_DIR, BackupManifest } from '../backup_manifest.js';
import { ProgressEvent } from '../progress.js';
import { RestoreError } from './types.js';

/**
 * How many bytes of a single file must be copied before another progress event
 * is emitted. The database restores as one multi-gigabyte file, so reporting
 * every chunk would emit thousands of events for it.
 */
const DEFAULT_PROGRESS_EVENT_INTERVAL_BYTES = 8_000_000; // 8 MB

/**
 * Copies every file the manifest promises into the workspace, verifying each
 * against its manifest entry as it lands.
 */
export async function copyBackupFiles({
  backup,
  manifest,
  workspacePath,
  onProgressEvent,
  progressEventIntervalBytes = DEFAULT_PROGRESS_EVENT_INTERVAL_BYTES,
}: {
  backup: AuthenticatedBackup;
  manifest: BackupManifest;
  workspacePath: string;
  onProgressEvent?: (event: ProgressEvent) => void;
  progressEventIntervalBytes?: number;
}): Promise<Result<void, RestoreError>> {
  const workspacePrefix = `${BACKUP_WORKSPACE_DIR}/`;
  let copiedCount = 0;
  let copiedBytes = 0;
  const totalCount = manifest.files.length;
  const totalBytes = iter(manifest.files).sum((file) => file.size);
  onProgressEvent?.({
    type: 'copy_files',
    copiedCount,
    totalCount,
    copiedBytes,
    totalBytes,
  });

  for (const file of manifest.files) {
    onProgressEvent?.({
      type: 'copy_files',
      current: file.path,
      copiedCount,
      totalCount,
      copiedBytes,
      totalBytes,
    });

    const destinationPath = join(
      workspacePath,
      file.path.slice(workspacePrefix.length)
    );
    await mkdir(dirname(destinationPath), { recursive: true });

    // Capped at what the manifest promises, so a file that has grown is
    // stopped at the limit rather than copied in full and rejected after.
    let lastReportedFileBytes = 0;
    const copiedCountBeforeFile = copiedCount;
    const copiedBytesBeforeFile = copiedBytes;
    const copyResult = await copyFile({
      source: join(backup.path, file.path),
      destination: destinationPath,
      maxSize: file.size,
      digest: 'sha256',
      onProgress: (fileBytes) => {
        if (fileBytes - lastReportedFileBytes >= progressEventIntervalBytes) {
          lastReportedFileBytes = fileBytes;
          onProgressEvent?.({
            type: 'copy_files',
            current: file.path,
            copiedCount: copiedCountBeforeFile,
            totalCount,
            copiedBytes: copiedBytesBeforeFile + fileBytes,
            totalBytes,
          });
        }
      },
    });

    if (copyResult.isErr()) {
      const error = copyResult.err();
      switch (error.type) {
        case 'OpenFileError': {
          return err({
            type: 'backup-verification-failed',
            message: `Missing backup file: ${file.path}`,
          });
        }

        case 'FileExceedsMaxSize': {
          return err({
            type: 'backup-verification-failed',
            message: `File is larger than its manifest entry: ${file.path}`,
          });
        }

        case 'ReadFileError':
        case 'WriteFileError': {
          return err({
            type: 'backup-read-failed',
            message: `${extractErrorMessage(error.error)} (${file.path})`,
          });
        }

        /* istanbul ignore next: Compile-time check for completeness */
        default: {
          throwIllegalValue(error, 'type');
        }
      }
    }

    const { size, sha256 } = copyResult.ok();
    if (size !== file.size || sha256 !== file.hash) {
      return err({
        type: 'backup-verification-failed',
        message: `File does not match expected size or content: ${file.path}`,
      });
    }

    copiedCount += 1;
    copiedBytes += size;
    onProgressEvent?.({
      type: 'copy_files',
      copiedCount,
      totalCount,
      copiedBytes,
      totalBytes,
    });
  }

  return ok();
}
