import { Buffer } from 'node:buffer';
import { join, relative, sep } from 'node:path';
import {
  authenticateArtifactUsingSignatureFile,
  SIGNATURE_FILE_EXTENSION,
  VXADMIN_BACKUP_MANIFEST_FILE_NAME,
} from '@votingworks/auth';
import {
  Result,
  err,
  extractErrorMessage,
  isNonExistentFileOrDirectoryError,
  iter,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type FileHandle } from 'node:fs/promises';
import { constants, open, readdir } from './fs.js';
import {
  BACKUP_MANIFEST_VERSION,
  backupFilePath,
  BackupManifest,
  parseManifest,
  readManifestContents,
  WORKSPACE_DIRECTORY_NAME,
} from './manifest.js';

/**
 * How far a validation has gotten. Validation re-reads and re-hashes every file
 * the manifest lists, so on a large backup it takes long enough that a caller
 * needs to be able to show that it is still working.
 */
export interface BackupValidationProgress {
  bytesCompleted: number;
  bytesTotal: number;
}

/**
 * A reason a backup on a drive doesn't match its signed manifest. Any of these
 * makes the backup unusable for a restore.
 */
export type BackupValidationError =
  | { type: 'manifest_unreadable'; message: string }
  | { type: 'signature_invalid'; message: string }
  | {
      type: 'manifest_version_unsupported';
      version: number;
    }
  | {
      type: 'software_version_mismatch';
      expectedSoftwareVersion: string;
      actualSoftwareVersion: string;
    }
  | { type: 'file_missing'; path: string }
  | { type: 'file_not_regular'; path: string }
  | {
      type: 'file_size_mismatch';
      path: string;
      expectedSize: number;
      actualSize: number;
    }
  | {
      type: 'file_hash_mismatch';
      path: string;
      expectedSha256: string;
      actualSha256: string;
    }
  | { type: 'unexpected_file'; path: string };

/**
 * Renders a {@link BackupValidationError} for a person to read.
 */
export function formatBackupValidationError(
  error: BackupValidationError
): string {
  switch (error.type) {
    case 'manifest_unreadable':
      return `The backup manifest could not be read: ${error.message}`;
    case 'signature_invalid':
      return `The backup manifest's signature is not valid: ${error.message}`;
    case 'manifest_version_unsupported':
      return (
        `The backup is in manifest format version ${error.version}, which ` +
        `this software does not understand.`
      );
    case 'software_version_mismatch':
      return (
        `The backup was made by software version ${error.actualSoftwareVersion}, ` +
        `but this machine is running ${error.expectedSoftwareVersion}.`
      );
    case 'file_missing':
      return `The backup is missing ${error.path}.`;
    case 'file_not_regular':
      return `${error.path} is not a regular file in the backup.`;
    case 'file_size_mismatch':
      return (
        `${error.path} is ${error.actualSize} bytes in the backup, ` +
        `but the manifest says it should be ${error.expectedSize} bytes.`
      );
    case 'file_hash_mismatch':
      return `${error.path} does not match the hash recorded in the manifest.`;
    case 'unexpected_file':
      return `The backup contains ${error.path}, which the manifest does not list.`;
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      return throwIllegalValue(error, 'type');
  }
}

/**
 * Whether opening a path failed because it isn't a regular file. `O_NOFOLLOW`
 * reports a symlink as `ELOOP`; the others are what a directory, or a path whose
 * parent isn't a directory, give.
 */
function isNotRegularFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ELOOP' ||
      error.code === 'EISDIR' ||
      error.code === 'ENOTDIR')
  );
}

/**
 * Every entry under the given directory that isn't a directory itself, relative
 * to it. Symlinks and special files are listed rather than skipped: a backup
 * holds only regular files, so anything else is something the manifest cannot
 * have listed, and skipping it would let it ride along unnoticed. `readdir` does
 * not descend into a symlinked directory, so one shows up here as an entry of
 * its own rather than as the files it points at.
 */
async function listEntriesRecursively(
  directoryPath: string
): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
    recursive: true,
  });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      relative(directoryPath, join(entry.parentPath, entry.name))
        .split(sep)
        .join('/')
    );
}

/**
 * Checks that a backup on a drive is intact and authentic: its manifest is
 * signed by a VxAdmin, it was made by the expected software version, and every
 * file it lists is present with the recorded size and hash, with nothing extra.
 * "Nothing extra" is checked over files, symlinks, and special files, not over
 * directories themselves: an added directory holding any of those is caught by
 * what it holds, and an added empty one carries nothing a restore would read.
 *
 * This is an integrity check, not a security boundary. It re-reads the drive,
 * and a drive that serves different bytes later can still pass it; restore
 * protects itself by hashing the bytes it writes to the internal disk.
 */
export async function validateBackup({
  backupDirectoryPath,
  expectedSoftwareVersion,
  onProgress,
}: {
  backupDirectoryPath: string;
  expectedSoftwareVersion?: string;
  onProgress?: (progress: BackupValidationProgress) => void;
}): Promise<Result<BackupManifest, BackupValidationError>> {
  const contentsResult = await readManifestContents(backupDirectoryPath);
  if (contentsResult.isErr()) {
    return err({
      type: 'manifest_unreadable',
      message: extractErrorMessage(contentsResult.err()),
    });
  }
  const contents = contentsResult.ok();
  const manifestResult = parseManifest(contents);
  if (manifestResult.isErr()) {
    return err({
      type: 'manifest_unreadable',
      message: extractErrorMessage(manifestResult.err()),
    });
  }
  const manifest = manifestResult.ok();

  // The bytes parsed above are the bytes whose signature is checked, so there is
  // no window in which a drive could answer one read with a genuine manifest and
  // another with attacker-chosen hashes.
  const authenticationResult = await authenticateArtifactUsingSignatureFile({
    type: 'vxadmin_backup',
    context: 'import',
    directoryPath: backupDirectoryPath,
    manifestFileContents: contents,
  });
  if (authenticationResult.isErr()) {
    return err({
      type: 'signature_invalid',
      message: extractErrorMessage(authenticationResult.err()),
    });
  }

  // A later format could hash differently, require files this doesn't know
  // about, or encrypt them. Checking every rule this version knows and calling
  // the result valid would be a lie about a backup we can't actually read.
  if (manifest.version !== BACKUP_MANIFEST_VERSION) {
    return err({
      type: 'manifest_version_unsupported',
      version: manifest.version,
    });
  }

  if (
    expectedSoftwareVersion !== undefined &&
    manifest.softwareVersion !== expectedSoftwareVersion
  ) {
    return err({
      type: 'software_version_mismatch',
      expectedSoftwareVersion,
      actualSoftwareVersion: manifest.softwareVersion,
    });
  }

  const bytesTotal = iter(manifest.files).sum(({ size }) => size);
  let bytesCompleted = 0;
  onProgress?.({ bytesCompleted, bytesTotal });

  for (const file of manifest.files) {
    const filePath = backupFilePath(backupDirectoryPath, file.path);
    let size = 0;
    const hash = createHash('sha256');

    // `O_NOFOLLOW` keeps validation from reading through a symlink left where a
    // file belongs. It only covers the last path component; a symlinked parent
    // directory is caught instead by the unexpected-entry pass below, which sees
    // the link rather than the files it points at.
    let handle: FileHandle;
    try {
      // eslint-disable-next-line no-bitwise
      handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (isNonExistentFileOrDirectoryError(error)) {
        return err({ type: 'file_missing', path: file.path });
      }
      if (isNotRegularFileError(error)) {
        return err({ type: 'file_not_regular', path: file.path });
      }
      throw error;
    }

    // The read stream closes the handle, whether it reaches the end or the
    // pipeline fails partway through.
    await pipeline(
      handle.createReadStream(),
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          size += chunk.length;
          callback();
        },
      })
    );
    if (size !== file.size) {
      return err({
        type: 'file_size_mismatch',
        path: file.path,
        expectedSize: file.size,
        actualSize: size,
      });
    }
    const sha256 = hash.digest('hex');
    if (sha256 !== file.sha256) {
      return err({
        type: 'file_hash_mismatch',
        path: file.path,
        expectedSha256: file.sha256,
        actualSha256: sha256,
      });
    }
    bytesCompleted += file.size;
    onProgress?.({ bytesCompleted, bytesTotal });
  }

  const expectedPaths = new Set([
    ...manifest.files.map((file) => `${WORKSPACE_DIRECTORY_NAME}/${file.path}`),
    VXADMIN_BACKUP_MANIFEST_FILE_NAME,
    `${VXADMIN_BACKUP_MANIFEST_FILE_NAME}${SIGNATURE_FILE_EXTENSION}`,
  ]);
  for (const filePath of await listEntriesRecursively(backupDirectoryPath)) {
    if (!expectedPaths.has(filePath)) {
      return err({ type: 'unexpected_file', path: filePath });
    }
  }

  return ok(manifest);
}
