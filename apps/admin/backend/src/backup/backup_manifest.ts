import { z } from 'zod/v4';
import {
  DateWithoutTimeSchema,
  ElectionIdSchema,
  Iso8601DateTimeSchema,
  type Iso8601Timestamp,
} from '@votingworks/types';

/**
 * The current backup manifest version. Change this whenever the schema changes.
 */
export const BACKUP_MANIFEST_VERSION = 1;

/**
 * The directory within a backup holding the copied workspace files, and thus
 * the first segment of every manifest entry's path. Shared by the create side,
 * which writes files under it, and the restore side, which refuses a manifest
 * entry outside it.
 */
export const BACKUP_WORKSPACE_DIR = 'workspace';

/**
 * Schema for {@link ElectionMetadata}.
 */
export const ElectionMetadataSchema = z.object({
  id: ElectionIdSchema,
  title: z.string().nonempty(),
  date: DateWithoutTimeSchema,
  jurisdictionName: z.string().nonempty(),
  state: z.string().nonempty(),
});

/**
 * Basic information about an election for identification purposes.
 */
export interface ElectionMetadata extends z.infer<
  typeof ElectionMetadataSchema
> {}

/**
 * Schema for {@link BackupManifestEntry}.
 */
export const BackupManifestEntrySchema = z.object({
  path: z.string().refine(isContainedRelativePath, {
    message: 'must be a relative path within the backup, using `/` separators',
  }),
  hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'hash must be a lowercase hex SHA-256 digest'),
  size: z.number().int().nonnegative(),
});

function isContainedRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\')) {
    return false;
  }

  const segments = path.split('/');
  return segments.every(
    (segment) => segment !== '' && segment !== '.' && segment !== '..'
  );
}

/**
 * An entry in a `manifest.json` file.
 */
export interface BackupManifestEntry extends z.infer<
  typeof BackupManifestEntrySchema
> {}

/**
 * Schema for {@see BackupManifestStruct}.
 */
export const BackupManifestStructSchema = z.object({
  version: z.literal(BACKUP_MANIFEST_VERSION),
  softwareVersion: z.string().nonempty(),
  machineId: z.string().nonempty(),
  createdAt: Iso8601DateTimeSchema,
  election: ElectionMetadataSchema,
  cvrCount: z.number().int().nonnegative(),
  files: BackupManifestEntrySchema.array(),
});

/**
 * A plain object version of the backup manifest.
 */
export interface BackupManifestStruct extends z.infer<
  typeof BackupManifestStructSchema
> {}

/**
 * An in-memory representation of a backup's `manifest.json`.
 */
export class BackupManifest {
  private readonly manifestSoftwareVersion: string;
  private readonly manifestMachineId: string;
  private readonly manifestCreatedAt: Iso8601Timestamp;
  private readonly manifestElection: ElectionMetadata;
  private readonly manifestCvrCount: number;
  private readonly manifestFiles: BackupManifestEntry[];

  constructor({
    softwareVersion,
    machineId,
    createdAt,
    election,
    cvrCount,
    files,
  }: Omit<BackupManifestStruct, 'version'>) {
    this.manifestSoftwareVersion = softwareVersion;
    this.manifestMachineId = machineId;
    this.manifestCreatedAt = createdAt;
    this.manifestElection = election;
    this.manifestCvrCount = cvrCount;
    this.manifestFiles = files;
  }

  static fromStruct(data: BackupManifestStruct): BackupManifest {
    return new BackupManifest(data);
  }

  get softwareVersion(): string {
    return this.manifestSoftwareVersion;
  }

  get machineId(): string {
    return this.manifestMachineId;
  }

  get createdAt(): Iso8601Timestamp {
    return this.manifestCreatedAt;
  }

  get election(): ElectionMetadata {
    return this.manifestElection;
  }

  get cvrCount(): number {
    return this.manifestCvrCount;
  }

  get files(): readonly BackupManifestEntry[] {
    return this.manifestFiles;
  }

  toJSON(): BackupManifestStruct {
    const manifest: BackupManifestStruct = {
      version: BACKUP_MANIFEST_VERSION,
      softwareVersion: this.manifestSoftwareVersion,
      machineId: this.manifestMachineId,
      createdAt: this.manifestCreatedAt.toString(),
      election: this.manifestElection,
      cvrCount: this.manifestCvrCount,
      files: [...this.manifestFiles],
    };

    // assert validity
    BackupManifestStructSchema.parse(manifest);

    return manifest;
  }
}
