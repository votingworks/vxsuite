import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod/v4';
import { VXADMIN_BACKUP_MANIFEST_FILE_NAME } from '@votingworks/auth';
import { Result, err } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';

/**
 * The directory, at the root of a backup drive, that all backups live in.
 */
export const BACKUPS_DIRECTORY_NAME = 'vxadmin-backups';

/**
 * The suffix for the directory a backup is written to before it is swapped into
 * place. Never a valid restore source.
 */
export const IN_PROGRESS_DIRECTORY_SUFFIX = '-in-progress';

/**
 * The suffix for the directory the previous backup is moved aside to during the
 * swap, just before it is deleted. Never a valid restore source.
 */
export const PREVIOUS_DIRECTORY_SUFFIX = '-previous';

/**
 * The format version of the manifest written by this software.
 */
export const BACKUP_MANIFEST_VERSION = 1;

/**
 * A single backed-up file, hashed on the internal disk as it was written to the
 * backup drive. Paths are relative to the backup directory and always use `/`.
 */
export interface BackupManifestFile {
  path: string;
  sha256: string;
  size: number;
}

/**
 * The signed inventory of a backup. Everything else in the backup directory is
 * covered by a hash within it.
 */
export interface BackupManifest {
  version: number;
  softwareVersion: string;
  machineId: string;
  createdAt: string;
  election: {
    id: string;
    title: string;
    date: string;
  };
  files: BackupManifestFile[];
}

/**
 * Schema for {@link BackupManifest}.
 */
export const BackupManifestSchema: z.ZodType<BackupManifest> = z.object({
  version: z.number().int().positive(),
  softwareVersion: z.string(),
  machineId: z.string(),
  createdAt: z.string(),
  election: z.object({
    id: z.string(),
    title: z.string(),
    date: z.string(),
  }),
  files: z.array(
    z.object({
      path: z.string(),
      sha256: z.string(),
      size: z.number().int().nonnegative(),
    })
  ),
});

/**
 * The path of the manifest within the given backup directory.
 */
export function manifestPath(backupDirectoryPath: string): string {
  return join(backupDirectoryPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME);
}

/**
 * Reads and parses the manifest in the given backup directory. Reading the
 * manifest says nothing about its authenticity; callers that care must verify
 * its signature.
 */
export async function readManifest(
  backupDirectoryPath: string
): Promise<Result<BackupManifest, Error>> {
  let contents: string;
  try {
    contents = await readFile(manifestPath(backupDirectoryPath), 'utf-8');
  } catch (error) {
    return err(error as Error);
  }
  return safeParseJson(contents, BackupManifestSchema);
}

/**
 * Computes the SHA-256 hash of the file at the given path.
 */
export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

/**
 * Whether the given directory name is one of the transient directories a backup
 * uses while being written or swapped into place. These are never valid restore
 * sources and are deleted by the next backup.
 */
export function isTransientBackupDirectoryName(directoryName: string): boolean {
  return (
    directoryName.endsWith(IN_PROGRESS_DIRECTORY_SUFFIX) ||
    directoryName.endsWith(PREVIOUS_DIRECTORY_SUFFIX)
  );
}
