import { throwIllegalValue } from '@votingworks/basics';
import { formatBytes } from './fs_utils';
import { BackupStopReason } from './backup';

/** Converts structured backup stop reasons to user-facing messages. */
export function formatBackupStopReason(error: BackupStopReason): string {
  switch (error.type) {
    case 'cancelled':
      return 'Operation cancelled.';
    case 'noElectionConfigured':
      return 'No election is currently configured. Configure an election before backing up.';
    case 'error':
      return error.error.message;
    case 'insufficientDiskSpace':
      return error.location === 'internal'
        ? `Internal drive has insufficient space. Need ~${formatBytes(
            error.required
          )}, available: ${formatBytes(error.available)}.`
        : `Backup drive has insufficient space. Need ~${formatBytes(
            error.required
          )}, available: ${formatBytes(error.available)}.`;
    case 'invalidManifestSignature':
      return 'Backup manifest signature is invalid.';
    case 'invalidFileHash':
      return `Hash mismatch for ${error.path}: expected ${error.expected}, got ${error.actual}`;
    case 'mismatchedSoftwareVersion':
      return `Backup was created with software version ${error.actual}, current version is ${error.expected}.`;
    default:
      return throwIllegalValue(error, 'type');
  }
}
