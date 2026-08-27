import { readFile, ReadFileError } from '@votingworks/fs';
import { err, extractErrorMessage, ok, Result } from '@votingworks/basics';
import { safeParse, safeParseJson } from '@votingworks/types';
import {
  BACKUP_MANIFEST_VERSION,
  BackupManifest,
  BackupManifestStructSchema,
} from './backup_manifest.js';

const BACKUP_MANIFEST_MAX_SIZE = 100_000_000; // 100 MB

/**
 * Why a `manifest.json` could not be read as a {@link BackupManifest}. A
 * mismatched version is its own answer rather than one shape of parse failure:
 * a manifest from other software is not corrupt, it is just not ours to read.
 */
export type ReadManifestError =
  | { type: 'read-failed'; message: string }
  | { type: 'invalid-manifest'; message: string }
  | { type: 'unsupported-version'; version: unknown; message: string };

function describeReadFileError(error: ReadFileError): string {
  switch (error.type) {
    case 'FileExceedsMaxSize': {
      return `file is larger than the maximum of ${error.maxSize} bytes`;
    }

    default: {
      return extractErrorMessage(error.error);
    }
  }
}

/**
 * Reads and parses a `manifest.json` at a given path. Says nothing about
 * whether that manifest is authentic; see {@link AuthenticatedBackup}, which is
 * the only thing that reads a manifest out of a backup.
 */
export class BackupManifestFile {
  constructor(private readonly manifestPath: string) {}

  get path(): string {
    return this.manifestPath;
  }

  async readManifest(): Promise<Result<BackupManifest, ReadManifestError>> {
    const readFileResult = await readFile(this.manifestPath, {
      maxSize: BACKUP_MANIFEST_MAX_SIZE,
    });
    if (readFileResult.isErr()) {
      return err({
        type: 'read-failed',
        message: describeReadFileError(readFileResult.err()),
      });
    }

    const parseJsonResult = safeParseJson(
      readFileResult.ok().toString('utf-8')
    );
    if (parseJsonResult.isErr()) {
      return err({
        type: 'invalid-manifest',
        message: extractErrorMessage(parseJsonResult.err()),
      });
    }

    // Checked apart from the schema, and before it, so that the version can be
    // reported as what it is. The schema would reject a mismatch too, but only
    // as an anonymous parse failure.
    const raw = parseJsonResult.ok();
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'version' in raw &&
      raw.version !== BACKUP_MANIFEST_VERSION
    ) {
      return err({
        type: 'unsupported-version',
        version: raw.version,
        message: `Expected backup version ${BACKUP_MANIFEST_VERSION}, but the manifest has version ${JSON.stringify(
          raw.version
        )}`,
      });
    }

    const parseManifestResult = safeParse(BackupManifestStructSchema, raw);
    if (parseManifestResult.isErr()) {
      return err({
        type: 'invalid-manifest',
        message: extractErrorMessage(parseManifestResult.err()),
      });
    }

    return ok(BackupManifest.fromStruct(parseManifestResult.ok()));
  }
}
