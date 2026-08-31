import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { DateTime } from 'luxon';
import { assert, assertDefined, ok, Result } from '@votingworks/basics';
import { copyFile, CopyFileError } from '@votingworks/fs';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import {
  BACKUP_WORKSPACE_DIR,
  BackupManifest,
  BackupManifestEntry,
} from '../backup_manifest.js';
import { CopyBackupOptions } from './types.js';
import { getMachineConfig } from '../../machine_config.js';

/**
 * How many bytes of a single file must be copied before another progress event
 * is emitted. Streams arrive in 64 KB chunks, so reporting every chunk would
 * emit tens of thousands of events for one multi-gigabyte database snapshot.
 */
const DEFAULT_PROGRESS_EVENT_INTERVAL_BYTES = 8_000_000; // 8 MB

/**
 * Copies files from a backup staging area to the target, building a manifest
 * as it does so.
 *
 * Cancelling is left to {@link copyFile}, which refuses to open a file once
 * `signal` has aborted and stops between chunks of one it is partway through.
 * A cancel between two files is therefore reported by the next file's copy
 * rather than by this loop.
 */
export async function copy(
  options: CopyBackupOptions
): Promise<Result<BackupManifest, CopyFileError>> {
  const { electionId, signal, source, store } = options;
  const progressEventIntervalBytes =
    options.progressEventIntervalBytes ?? DEFAULT_PROGRESS_EVENT_INTERVAL_BYTES;
  let copiedCount = 0;
  let copiedBytes = 0;
  const totalCount = source.fileCount;
  const totalBytes = source.fileSizeBytes;
  const backupManifestEntries: BackupManifestEntry[] = [];
  options.onProgressEvent?.({
    type: 'copy_files',
    copiedCount,
    totalCount,
    copiedBytes,
    totalBytes,
  });
  const backupPath = options.backup;
  const backupWorkspacePath = join(backupPath, BACKUP_WORKSPACE_DIR);

  // `prepare` resolved this election ID against the same snapshot, so its
  // metadata is necessarily there.
  const electionMetadata = assertDefined(store.getElectionMetadata(electionId));

  for (const file of source.listStagedFiles()) {
    options.onProgressEvent?.({
      type: 'copy_files',
      current: file.relativePath,
      copiedCount,
      totalCount,
      copiedBytes,
      totalBytes,
    });
    const targetFilePath = join(backupWorkspacePath, file.relativePath);
    await mkdir(dirname(targetFilePath), { recursive: true });
    const baseCopiedCount = copiedCount;
    const baseCopiedBytes = copiedBytes;
    let reportedSize = 0;

    const copyFileResult = await copyFile({
      source: file.path,
      destination: targetFilePath,
      maxSize: file.size,
      digest: 'sha256',
      signal,
      onProgress(fileCopiedBytes) {
        if (fileCopiedBytes - reportedSize >= progressEventIntervalBytes) {
          reportedSize = fileCopiedBytes;
          options.onProgressEvent?.({
            type: 'copy_files',
            current: file.relativePath,
            copiedCount: baseCopiedCount,
            totalCount,
            copiedBytes: baseCopiedBytes + fileCopiedBytes,
            totalBytes,
          });
        }
      },
    });

    if (copyFileResult.isErr()) {
      return copyFileResult;
    }

    const { size, sha256: hash } = copyFileResult.ok();
    copiedCount += 1;
    copiedBytes += file.size;

    assert(
      size === file.size,
      `BUG: stat size does not match read size (${file.size} != ${size})`
    );

    backupManifestEntries.push({
      path: relative(backupPath, targetFilePath),
      size,
      hash,
    });
  }

  assert(
    copiedCount === totalCount,
    `BUG: not all file copied!? copied count ${copiedCount} != total count ${totalCount}`
  );
  assert(
    copiedBytes === totalBytes,
    `BUG: not all files copied!? copied bytes ${copiedBytes} != total bytes ${totalBytes}`
  );
  options.onProgressEvent?.({
    type: 'copy_files',
    copiedCount,
    totalCount,
    copiedBytes,
    totalBytes,
  });

  const softwareVersion = LATEST_SOFTWARE_VERSION;
  const machineConfig = getMachineConfig();

  return ok(
    new BackupManifest(
      softwareVersion,
      machineConfig.machineId,
      DateTime.now().toISO(),
      electionMetadata,
      backupManifestEntries
    )
  );
}
