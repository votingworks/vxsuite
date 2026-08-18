import { readFile, ReadFileError } from '@votingworks/fs';
import { ok, Result } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import { z } from 'zod/v4';
import {
  BackupManifest,
  BackupManifestStructSchema,
} from './backup_manifest.js';

const BACKUP_MANIFEST_MAX_SIZE = 100_000_000; // 100 MB

/**
 * Backup manifest manager for the on-disk `manifest.json` within a backup.
 */
export class BackupManifestFile {
  constructor(private readonly manifestPath: string) {}

  get path(): string {
    return this.manifestPath;
  }

  async readManifest(): Promise<
    Result<BackupManifest, ReadFileError | SyntaxError | z.ZodError<unknown>>
  > {
    const readFileResult = await readFile(this.manifestPath, {
      maxSize: BACKUP_MANIFEST_MAX_SIZE,
    });
    if (readFileResult.isErr()) return readFileResult;
    const parseManifestResult = safeParseJson(
      readFileResult.ok().toString('utf-8'),
      BackupManifestStructSchema
    );
    return parseManifestResult.isErr()
      ? parseManifestResult
      : ok(BackupManifest.fromStruct(parseManifestResult.ok()));
  }
}
