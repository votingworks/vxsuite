import { readdir, stat } from 'node:fs/promises';
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
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  BACKUP_MANIFEST_VERSION,
  backupFilePath,
  BackupManifest,
  parseManifest,
  readManifestContents,
  sha256File,
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

async function listFilesRecursively(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
    recursive: true,
  });
  return entries
    .filter((entry) => entry.isFile())
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

  const bytesTotal = manifest.files.reduce((sum, file) => sum + file.size, 0);
  let bytesCompleted = 0;
  onProgress?.({ bytesCompleted, bytesTotal });

  for (const file of manifest.files) {
    const filePath = backupFilePath(backupDirectoryPath, file.path);
    let size: number;
    try {
      ({ size } = await stat(filePath));
    } catch {
      return err({ type: 'file_missing', path: file.path });
    }
    if (size !== file.size) {
      return err({
        type: 'file_size_mismatch',
        path: file.path,
        expectedSize: file.size,
        actualSize: size,
      });
    }
    const sha256 = await sha256File(filePath);
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
  for (const filePath of await listFilesRecursively(backupDirectoryPath)) {
    if (!expectedPaths.has(filePath)) {
      return err({ type: 'unexpected_file', path: filePath });
    }
  }

  return ok(manifest);
}
