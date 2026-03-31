import { Id } from '@votingworks/types';

/**
 * Top-level directory on a backup drive that contains all VxAdmin backups.
 */
export const BACKUP_ROOT_DIR = 'vxadmin-backups';

/**
 * Suffix appended to a backup directory name while a backup is in progress.
 */
export const IN_PROGRESS_SUFFIX = '-in-progress';

/**
 * Suffix appended to the previous backup directory while being replaced.
 */
export const PREVIOUS_SUFFIX = '-previous';

/**
 * Name of the manifest file within a backup directory.
 */
export const MANIFEST_FILENAME = 'manifest.json';

/**
 * Name of the signature file for the manifest.
 */
export const MANIFEST_SIGNATURE_FILENAME = 'manifest.json.vxsig';

/**
 * Name of the database file within a backup directory.
 */
export const BACKUP_DB_FILENAME = 'data.db';

/**
 * Name of the ballot images subdirectory within a backup directory.
 */
export const BACKUP_IMAGES_DIR = 'ballot-images';

/**
 * Name of the restore-in-progress directory within the workspace.
 */
export const RESTORE_IN_PROGRESS_DIR = 'restore-in-progress';

/** A single file entry in a backup manifest. */
export interface BackupManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

/** Manifest describing a complete backup, including all files and metadata. */
export interface BackupManifest {
  readonly version: 1;
  readonly electionId: Id;
  readonly electionTitle: string;
  readonly electionDate: string;
  readonly machineId: string;
  readonly softwareVersion: string;
  readonly createdAt: string;
  readonly files: BackupManifestFile[];
}

/** Phases of a backup operation. */
export type BackupPhase =
  | 'preflight'
  | 'snapshot'
  | 'images'
  | 'signing'
  | 'validating';

/** Progress information for a running backup. */
export interface BackupProgress {
  readonly phase: BackupPhase;
  readonly imagesTotal: number;
  readonly imagesCopied: number;
}

/** What triggered a backup operation. */
export type BackupTrigger = 'manual' | 'auto';

/** Current status of a backup operation. */
export type BackupOperationStatus =
  | { readonly type: 'idle' }
  | {
      readonly type: 'running';
      readonly trigger: BackupTrigger;
      readonly startedAt: string;
      readonly progress: BackupProgress;
    }
  | {
      readonly type: 'success';
      readonly trigger: BackupTrigger;
      readonly completedAt: string;
    }
  | {
      readonly type: 'error';
      readonly trigger: BackupTrigger;
      readonly error: string;
      readonly failedAt: string;
    };

/** Summary of a backup stored on a drive. */
export interface BackupEntry {
  readonly electionId: Id;
  readonly electionTitle: string;
  readonly electionDate: string;
  readonly machineId: string;
  readonly softwareVersion: string;
  readonly createdAt: string;
  readonly sizeBytes: number;
  readonly directoryName: string;
}

/** Information about a USB drive used for backups. */
export interface BackupDriveInfo {
  readonly driveDevPath: string;
  readonly partitionDevPath: string;
  readonly mountPoint: string;
  readonly vendor?: string;
  readonly model?: string;
  readonly label?: string;
  readonly isBackupDrive: boolean;
}

/** Phases of a restore operation. */
export type RestorePhase = 'preflight' | 'copying' | 'activating';

/** Progress information for a running restore. */
export interface RestoreProgress {
  readonly phase: RestorePhase;
  readonly filesTotal: number;
  readonly filesCopied: number;
}
