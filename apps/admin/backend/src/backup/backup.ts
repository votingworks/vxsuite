import {
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Buffer } from 'node:buffer';
import makeDebug from 'debug';
import { assert, err, iter, ok, Result } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import { BaseLogger } from '@votingworks/logging';
import {
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';

import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupEntry,
  BackupManifest,
  BackupManifestFile,
  BackupManifestSchema,
  BackupProgress,
  IN_PROGRESS_SUFFIX,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
  PREVIOUS_SUFFIX,
} from './types';
import { signManifest, validateManifestSignature } from './signing';
import { sha256File } from '../util/sha256_file';
import {
  cleanupDirSafe,
  cleanupSafe,
  copyFileWithHash,
  formatBytes,
  getAvailableDiskSpace,
  ignoreMissing,
} from './fs_utils';
import { Store } from '../store';

const debug = makeDebug('admin:backup');

/** Context needed to perform a backup operation. */
export interface BackupContext {
  /** Path to the workspace directory on the internal drive, used for temporary files and disk space checks. */
  readonly workspacePath: string;
  /** Path to the admin backend SQLite database file. */
  readonly dbPath: string;
  /** Path to the directory containing ballot image files. */
  readonly ballotImagesPath: string;
  /** Mount point of the USB drive where backups are stored. */
  readonly backupDriveMountPoint: string;
  /** Identifier for the machine performing the backup, recorded in the manifest. */
  readonly machineId: string;
  /** Software version string recorded in the manifest and checked during validation. */
  readonly softwareVersion: string;
  readonly logger: BaseLogger;
  /** Creates a snapshot of the database at the given destination path (via VACUUM INTO). */
  backupDatabase: (destPath: string) => void;
  /** Optional callback invoked as the backup progresses through phases. */
  onProgress?: (progress: BackupProgress) => void;
  /** Signal to cancel the backup operation. */
  signal?: AbortSignal;
}

/** Reason for a backup to be stopped. */
export type BackupStopReason =
  | { type: 'error'; error: Error }
  | { type: 'noElectionConfigured' }
  | {
      type: 'insufficientDiskSpace';
      location: 'internal' | 'backupDrive';
      required: number;
      available: number;
    }
  | {
      type: 'invalidManifestSignature';
      manifestJson: Buffer;
      signatureData: Buffer;
    }
  | {
      type: 'invalidFileHash';
      path: string;
      expected: string;
      actual: string;
    }
  | { type: 'mismatchedSoftwareVersion'; expected: string; actual: string }
  | { type: 'cancelled' };

function getInternalAvailableSpace(workspacePath: string): number {
  return getAvailableDiskSpace(workspacePath);
}

interface CurrentElectionBackupInfo {
  readonly electionId: string;
  readonly electionTitle: string;
  readonly electionDate: string;
  readonly electionDirName: string;
}

function getCurrentElectionBackupInfo(
  dbPath: string,
  logger: BaseLogger
): Result<CurrentElectionBackupInfo, BackupStopReason> {
  try {
    const client = DbClient.fileClient(dbPath, logger);

    const settings = client.one(
      'select current_election_id as currentElectionId from settings'
    ) as { currentElectionId: string | null } | undefined;

    const electionId = settings?.currentElectionId;
    if (!electionId) {
      return err({ type: 'noElectionConfigured' });
    }

    const row = client.one(
      'select election_data as electionData from elections where id = ?',
      electionId
    ) as { electionData: string } | undefined;

    if (!row) {
      return err({
        type: 'error',
        error: new Error(`Election record not found for id: ${electionId}`),
      });
    }

    const parseResult = safeParseElectionDefinition(row.electionData);
    if (parseResult.isErr()) {
      return err({
        type: 'error',
        error: new Error(
          `Failed to parse election definition: ${parseResult.err().message}`
        ),
      });
    }

    const { election, ballotHash } = parseResult.ok();
    return ok({
      electionId,
      electionTitle: election.title,
      electionDate: election.date.toISOString(),
      electionDirName: generateElectionBasedSubfolderName(election, ballotHash),
    });
  } catch (error) {
    return err({
      type: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

/**
 * Read a previous manifest from a backup directory, if it exists and is valid.
 */
async function readPreviousManifest(
  backupDirPath: string
): Promise<BackupManifest | undefined> {
  try {
    const manifestJson = await readFile(join(backupDirPath, MANIFEST_FILENAME));
    const signatureData = await readFile(
      join(backupDirPath, MANIFEST_SIGNATURE_FILENAME)
    );
    const isValid = validateManifestSignature(manifestJson, signatureData);
    if (!isValid) {
      debug(
        'previous manifest signature invalid, treating as no previous backup'
      );
      return undefined;
    }
    const jsonParseResult = safeParseJson(manifestJson.toString('utf8'));
    if (jsonParseResult.isErr()) {
      debug('previous manifest is not valid JSON: %s', jsonParseResult.err());
      return undefined;
    }
    const parseResult = safeParse<BackupManifest>(
      BackupManifestSchema,
      jsonParseResult.ok()
    );
    if (parseResult.isErr()) {
      debug(
        'previous manifest failed schema validation: %s',
        parseResult.err()
      );
      return undefined;
    }
    return parseResult.ok();
  } catch (error) {
    debug('error reading previous manifest: %s', error);
    return undefined;
  }
}

/**
 * Query the database snapshot for all ballot image relative paths.
 *
 * Opens the snapshot database without schema validation to avoid resetting
 * the data (snapshot copies don't have an adjacent .digest file).
 */
function listBallotImagesFromDb(
  snapshotDbPath: string,
  ballotImagesPath: string,
  logger: BaseLogger
): string[] {
  const store = Store.snapshotStore(snapshotDbPath, ballotImagesPath, logger);
  return store.getBallotImageRelativeFilePaths().map(({ path }) => path);
}

/**
 * Back up the database and ballot images to a USB drive.
 *
 * Runs pre-flight checks, copies data, signs a manifest, and validates
 * the result.
 */
export async function performBackup(
  ctx: BackupContext
): Promise<Result<void, BackupStopReason>> {
  const backupRootPath = join(ctx.backupDriveMountPoint, BACKUP_ROOT_DIR);

  // Temp database path on internal drive
  const timestamp = new Date().toISOString().replace(/[^\d]/g, '');
  const tempDbPath = join(ctx.workspacePath, `admin-backup-${timestamp}.db`);

  const { result, inProgressDirPath } = await doBackup(
    ctx,
    backupRootPath,
    tempDbPath
  );

  // Clean up on failure
  if (result.isErr() && inProgressDirPath) {
    await cleanupDirSafe(inProgressDirPath);
  }

  await cleanupSafe(tempDbPath);
  return result;
}

interface DoBackupResult {
  readonly result: Result<void, BackupStopReason>;
  readonly inProgressDirPath?: string;
}

async function doBackup(
  ctx: BackupContext,
  backupRootPath: string,
  tempDbPath: string
): Promise<DoBackupResult> {
  // ── Pre-Flight ──────────────────────────────────────────────────────

  ctx.onProgress?.({
    phase: 'preflight',
    imagesTotal: 0,
    imagesCopied: 0,
  });

  debug('pre-flight: checking disk space');
  // 1. Check internal disk space for database copy
  const dbStat = await stat(ctx.dbPath);
  const internalSpace = getInternalAvailableSpace(ctx.workspacePath);
  debug(
    'internal space: %s, db size: %s',
    formatBytes(internalSpace),
    formatBytes(dbStat.size)
  );
  if (internalSpace > 0 && internalSpace < dbStat.size * 1.1) {
    return {
      result: err({
        type: 'insufficientDiskSpace',
        location: 'internal',
        required: dbStat.size,
        available: internalSpace,
      }),
    };
  }

  /* istanbul ignore next */
  if (ctx.signal?.aborted) {
    return { result: err({ type: 'cancelled' }) };
  }

  // 2. Copy database using VACUUM INTO
  ctx.onProgress?.({
    phase: 'snapshot',
    imagesTotal: 0,
    imagesCopied: 0,
  });

  debug('creating database snapshot at %s', tempDbPath);
  ctx.backupDatabase(tempDbPath);
  debug('database snapshot complete');

  /* istanbul ignore next */
  if (ctx.signal?.aborted) {
    return { result: err({ type: 'cancelled' }) };
  }

  const electionInfoResult = getCurrentElectionBackupInfo(
    tempDbPath,
    ctx.logger
  );
  if (electionInfoResult.isErr()) {
    return { result: electionInfoResult };
  }
  const electionInfo = electionInfoResult.ok();
  const electionDirPath = join(backupRootPath, electionInfo.electionDirName);
  const inProgressDirPath = join(
    backupRootPath,
    `${electionInfo.electionDirName}${IN_PROGRESS_SUFFIX}`
  );
  const previousDirPath = join(
    backupRootPath,
    `${electionInfo.electionDirName}${PREVIOUS_SUFFIX}`
  );

  // 3. Delete backup-related info from the copied database (if any)
  // Currently no backup-specific tables, but this is where we'd clean them

  // 4. Read previous manifest if available
  debug('reading previous manifest from %s', electionDirPath);
  await mkdir(backupRootPath, { recursive: true });

  const previousManifest = await readPreviousManifest(electionDirPath);
  const previousFileMap = new Map<string, BackupManifestFile>();
  if (previousManifest) {
    for (const file of previousManifest.files) {
      previousFileMap.set(file.path, file);
    }
    debug('previous manifest has %d files', previousManifest.files.length);
  } else {
    debug('no previous manifest found');
  }

  // 5. Calculate space needed on backup drive
  const allImageFiles = listBallotImagesFromDb(
    tempDbPath,
    ctx.ballotImagesPath,
    ctx.logger
  );

  const newImageFiles: string[] = [];
  let newImagesSize = 0;

  for (const imageRelPath of allImageFiles) {
    const backupImagePath = join(BACKUP_IMAGES_DIR, imageRelPath);
    if (!previousFileMap.has(backupImagePath)) {
      newImageFiles.push(imageRelPath);
      const imageStat = await stat(join(ctx.ballotImagesPath, imageRelPath));
      newImagesSize += imageStat.size;
    }
  }

  debug(
    'images: %d total, %d new (%s), %d reusable from previous backup',
    allImageFiles.length,
    newImageFiles.length,
    formatBytes(newImagesSize),
    allImageFiles.length - newImageFiles.length
  );

  const tempDbStat = await stat(tempDbPath);
  const totalNeeded = tempDbStat.size + newImagesSize;
  const driveSpace = getAvailableDiskSpace(ctx.backupDriveMountPoint);
  debug(
    'drive space: %s, needed: %s',
    formatBytes(driveSpace),
    formatBytes(totalNeeded)
  );

  // Only check if we could actually get disk space info
  if (driveSpace > 0 && driveSpace < totalNeeded * 1.05) {
    return {
      result: err({
        type: 'insufficientDiskSpace',
        location: 'backupDrive',
        required: totalNeeded,
        available: driveSpace,
      }),
      inProgressDirPath,
    };
  }

  /* istanbul ignore next */
  if (ctx.signal?.aborted) {
    return { result: err({ type: 'cancelled' }), inProgressDirPath };
  }

  // ── Backup ──────────────────────────────────────────────────────────

  // 1. Create in-progress directory
  await cleanupDirSafe(inProgressDirPath); // remove any leftover from a previous failed backup
  await mkdir(join(inProgressDirPath, BACKUP_IMAGES_DIR), { recursive: true });

  const manifestFiles: BackupManifestFile[] = [];

  // 2. Copy database
  debug('copying database (%s) to backup drive', formatBytes(tempDbStat.size));
  const destDbPath = join(inProgressDirPath, BACKUP_DB_FILENAME);
  const dbResult = await copyFileWithHash(tempDbPath, destDbPath);
  debug('database copy complete');
  manifestFiles.push({
    path: BACKUP_DB_FILENAME,
    sha256: dbResult.sha256,
    size: dbResult.size,
  });

  if (ctx.signal?.aborted) {
    return { result: err({ type: 'cancelled' }), inProgressDirPath };
  }

  // 3. Hard-link files from previous backup
  let imagesCopied = 0;
  const reusedImageFiles = allImageFiles.filter(
    (f) => !newImageFiles.includes(f)
  );

  if (reusedImageFiles.length > 0) {
    debug(
      'hard-linking %d images from previous backup',
      reusedImageFiles.length
    );
  }

  const imagesTotal = allImageFiles.length;

  for (const imageRelPath of reusedImageFiles) {
    if (ctx.signal?.aborted) {
      return { result: err({ type: 'cancelled' }), inProgressDirPath };
    }

    const backupImagePath = join(BACKUP_IMAGES_DIR, imageRelPath);
    const previousFile = previousFileMap.get(backupImagePath);
    assert(previousFile, `Expected previous file for ${backupImagePath}`);

    const srcPath = join(electionDirPath, backupImagePath);
    const destPath = join(inProgressDirPath, backupImagePath);

    // Ensure subdirectory exists
    await mkdir(dirname(destPath), { recursive: true });

    await link(srcPath, destPath);
    manifestFiles.push(previousFile);

    imagesCopied += 1;
    ctx.onProgress?.({
      phase: 'images',
      imagesTotal,
      imagesCopied,
    });
  }

  // 4. Copy new image files
  if (newImageFiles.length > 0) {
    debug(
      'copying %d new images (%s)',
      newImageFiles.length,
      formatBytes(newImagesSize)
    );
  }

  for (const imageRelPath of newImageFiles) {
    if (ctx.signal?.aborted) {
      return { result: err({ type: 'cancelled' }), inProgressDirPath };
    }

    const srcPath = join(ctx.ballotImagesPath, imageRelPath);
    const backupImagePath = join(BACKUP_IMAGES_DIR, imageRelPath);
    const destPath = join(inProgressDirPath, backupImagePath);

    // Ensure subdirectory exists
    await mkdir(dirname(destPath), { recursive: true });

    const result = await copyFileWithHash(srcPath, destPath);
    manifestFiles.push({
      path: backupImagePath,
      sha256: result.sha256,
      size: result.size,
    });

    imagesCopied += 1;
    ctx.onProgress?.({
      phase: 'images',
      imagesTotal,
      imagesCopied,
    });
  }

  if (ctx.signal?.aborted) {
    return { result: err({ type: 'cancelled' }), inProgressDirPath };
  }

  debug('all images processed (%d total)', imagesCopied);

  // 5. Create and sign manifest
  debug('signing manifest');
  ctx.onProgress?.({
    phase: 'signing',
    imagesTotal,
    imagesCopied: imagesTotal,
  });

  const manifest: BackupManifest = {
    version: 1,
    electionId: electionInfo.electionId,
    electionTitle: electionInfo.electionTitle,
    electionDate: electionInfo.electionDate,
    machineId: ctx.machineId,
    softwareVersion: ctx.softwareVersion,
    createdAt: new Date().toISOString(),
    files: manifestFiles,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);

  const signatureData = signManifest(manifestJson);

  const manifestPath = join(inProgressDirPath, MANIFEST_FILENAME);
  const sigPath = join(inProgressDirPath, MANIFEST_SIGNATURE_FILENAME);

  await writeFile(manifestPath, manifestJson, 'utf-8');
  await writeFile(sigPath, signatureData);
  debug('manifest written and signed');

  if (ctx.signal?.aborted) {
    return { result: err({ type: 'cancelled' }), inProgressDirPath };
  }

  // 6. Atomically swap directories
  debug('swapping backup directories (in-progress → final)');

  // Move previous backup to -previous
  await cleanupDirSafe(previousDirPath); // clean any leftover
  await ignoreMissing(rename(electionDirPath, previousDirPath));

  // Move in-progress to final
  await rename(inProgressDirPath, electionDirPath);

  // Delete -previous
  await cleanupDirSafe(previousDirPath);

  // ── Validate ────────────────────────────────────────────────────────

  ctx.onProgress?.({
    phase: 'validating',
    imagesTotal,
    imagesCopied: imagesTotal,
  });

  debug('validating backup');
  const validateResult = await validateBackup(
    electionDirPath,
    ctx.softwareVersion
  );

  /* istanbul ignore next */
  if (validateResult.isErr()) {
    return { result: validateResult };
  }

  debug('backup complete');
  return { result: ok() };
}

/**
 * Validate a backup directory by checking the manifest signature and
 * verifying file hashes.
 */
export async function validateBackup(
  backupDirPath: string,
  expectedSoftwareVersion?: string
): Promise<Result<BackupManifest, BackupStopReason>> {
  debug('validate: reading manifest from %s', backupDirPath);
  // 1. Read and verify manifest signature
  const manifestPath = join(backupDirPath, MANIFEST_FILENAME);
  const sigPath = join(backupDirPath, MANIFEST_SIGNATURE_FILENAME);

  const manifestJson = await readFile(manifestPath);
  const signatureData = await readFile(sigPath);

  debug('validate: verifying signature');
  const isValid = validateManifestSignature(manifestJson, signatureData);
  if (!isValid) {
    return err({
      type: 'invalidManifestSignature',
      manifestJson,
      signatureData,
    });
  }

  const jsonParseResult = safeParseJson(manifestJson.toString('utf8'));
  if (jsonParseResult.isErr()) {
    return err({
      type: 'error',
      error: new Error(
        `Invalid manifest JSON: ${jsonParseResult.err().message}`
      ),
    });
  }
  const parseResult = safeParse<BackupManifest>(
    BackupManifestSchema,
    jsonParseResult.ok()
  );
  if (parseResult.isErr()) {
    return err({
      type: 'error',
      error: new Error(`Invalid manifest: ${parseResult.err().message}`),
    });
  }
  const manifest = parseResult.ok();
  debug('validate: manifest has %d files', manifest.files.length);

  // 2. Check software version
  if (
    expectedSoftwareVersion &&
    expectedSoftwareVersion !== 'dev' &&
    manifest.softwareVersion !== expectedSoftwareVersion &&
    manifest.softwareVersion !== 'dev'
  ) {
    return err({
      type: 'mismatchedSoftwareVersion',
      expected: expectedSoftwareVersion,
      actual: manifest.softwareVersion,
    });
  }

  // 3. Verify file hashes
  debug('validate: verifying %d file hashes', manifest.files.length);
  let verified = 0;
  for (const file of manifest.files) {
    const filePath = join(backupDirPath, file.path);
    const hash = await sha256File(filePath);
    if (hash !== file.sha256) {
      return err({
        type: 'invalidFileHash',
        path: file.path,
        expected: file.sha256,
        actual: hash,
      });
    }
    verified += 1;
    if (verified % 100 === 0 || verified === manifest.files.length) {
      debug('validate: verified %d/%d files', verified, manifest.files.length);
    }
  }

  debug('validate: all files verified');
  return ok(manifest);
}

/**
 * List all backup entries on a backup drive.
 */
export async function listBackups(mountPoint: string): Promise<BackupEntry[]> {
  const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);

  let dirNames: string[];
  try {
    dirNames = await readdir(backupRootPath);
  } catch {
    return [];
  }

  const entries: BackupEntry[] = [];

  for (const dirName of dirNames) {
    // Skip in-progress and previous directories
    if (dirName.endsWith(IN_PROGRESS_SUFFIX)) continue;
    if (dirName.endsWith(PREVIOUS_SUFFIX)) continue;

    const dirPath = join(backupRootPath, dirName);

    try {
      const manifestJson = await readFile(join(dirPath, MANIFEST_FILENAME), {
        encoding: 'utf-8',
      });
      const jsonParseResult = safeParseJson(manifestJson);
      if (jsonParseResult.isErr()) {
        debug(
          'manifest in %s is not valid JSON: %s',
          dirName,
          jsonParseResult.err()
        );
        continue;
      }
      const parseResult = safeParse<BackupManifest>(
        BackupManifestSchema,
        jsonParseResult.ok()
      );
      if (parseResult.isErr()) {
        debug(
          'manifest in %s failed schema validation: %s',
          dirName,
          parseResult.err()
        );
        continue;
      }
      const manifest = parseResult.ok();
      const totalSize = iter(manifest.files)
        .map((f) => f.size)
        .sum();

      entries.push({
        electionId: manifest.electionId,
        electionTitle: manifest.electionTitle,
        electionDate: manifest.electionDate,
        machineId: manifest.machineId,
        softwareVersion: manifest.softwareVersion,
        createdAt: manifest.createdAt,
        sizeBytes: totalSize,
        directoryName: dirName,
      });
    } catch (error) {
      debug('error reading manifest in %s: %s', dirName, error);
    }
  }

  return [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
