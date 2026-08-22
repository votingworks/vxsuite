import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { DateTime } from 'luxon';
import { assert } from '@votingworks/basics';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { BackupManifest, BackupManifestEntry } from '../backup_manifest.js';
import { CopyBackupOptions } from './types.js';
import { getMachineConfig } from '../../machine_config.js';

/**
 * Copies files from a backup staging area to the target, building a manifest
 * as it does so.
 */
export async function copy(
  options: CopyBackupOptions
): Promise<BackupManifest> {
  const { source, store, electionRecord } = options;
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

  for (const file of source.listStagedFiles()) {
    options.onProgressEvent?.({
      type: 'copy_files',
      current: file.relativePath,
      copiedCount,
      totalCount,
      copiedBytes,
      totalBytes,
    });
    copiedCount += 1;
    copiedBytes += file.size;
    const targetFilePath = join(backupWorkspacePath, file.relativePath);
    await mkdir(dirname(targetFilePath), { recursive: true });
    const reader = createReadStream(file.path);
    const writer = createWriteStream(targetFilePath);
    const hash = createHash('sha256');
    let size = 0;

    await pipeline(
      reader,
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.write(chunk);
          size += chunk.byteLength;
          callback(null, chunk);
        },
      }),
      writer
    );

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
  const electionDefinitionId = store.getElectionDefinitionId(electionRecord.id);

  return new BackupManifest(
    softwareVersion,
    machineConfig.machineId,
    DateTime.now().toISO(),
    {
      id: electionDefinitionId,
      title: electionRecord.electionDefinition.election.title,
      date: electionRecord.electionDefinition.election.date,
    },
    backupManifestEntries
  );
}
