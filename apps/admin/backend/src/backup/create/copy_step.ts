import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { DateTime } from 'luxon';
import { assert, assertDefined } from '@votingworks/basics';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { BackupManifest, BackupManifestEntry } from '../backup_manifest.js';
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
 */
export async function copy(
  options: CopyBackupOptions
): Promise<BackupManifest> {
  const { electionId, source, store } = options;
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
  const backupWorkspacePath = join(backupPath, 'workspace');

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
    const reader = createReadStream(file.path);
    const writer = createWriteStream(targetFilePath);
    const hash = createHash('sha256');
    const baseCopiedCount = copiedCount;
    const baseCopiedBytes = copiedBytes;
    let size = 0;
    let reportedSize = 0;

    await pipeline(
      reader,
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.write(chunk);
          size += chunk.byteLength;

          if (size - reportedSize >= progressEventIntervalBytes) {
            reportedSize = size;
            options.onProgressEvent?.({
              type: 'copy_files',
              current: file.relativePath,
              copiedCount: baseCopiedCount,
              totalCount,
              copiedBytes: baseCopiedBytes + size,
              totalBytes,
            });
          }

          callback(null, chunk);
        },
      }),
      writer
    );

    copiedCount += 1;
    copiedBytes += file.size;

    assert(
      size === file.size,
      `BUG: stat size does not match read size (${file.size} != ${size})`
    );

    backupManifestEntries.push({
      path: relative(backupPath, targetFilePath),
      size,
      hash: hash.digest('hex'),
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

  return new BackupManifest(
    softwareVersion,
    machineConfig.machineId,
    DateTime.now().toISO(),
    electionMetadata,
    backupManifestEntries
  );
}
