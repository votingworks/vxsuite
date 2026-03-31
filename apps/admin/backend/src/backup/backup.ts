import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { link, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import makeDebug from 'debug';
import { assert } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import { BaseLogger } from '@votingworks/logging';

import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupEntry,
  BackupManifest,
  BackupManifestFile,
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
  formatBytes,
  getAvailableDiskSpace,
  ignoreMissing,
} from './fs_utils';

const debug = makeDebug('admin:backup');

/** Context needed to perform a backup operation. */
export interface BackupContext {
  readonly workspacePath: string;
  readonly dbPath: string;
  readonly ballotImagesPath: string;
  readonly backupDriveMountPoint: string;
  readonly electionId: string;
  readonly electionTitle: string;
  readonly electionDate: string;
  readonly electionDirName: string;
  readonly machineId: string;
  readonly softwareVersion: string;
  readonly logger: BaseLogger;
  backupDatabase: (destPath: string) => void;
  onProgress?: (progress: BackupProgress) => void;
  signal?: AbortSignal;
}

class BackupCancelledError extends Error {
  constructor() {
    super('Backup was cancelled');
    this.name = 'BackupCancelledError';
  }
}

function checkCancel(ctx: BackupContext): void {
  if (ctx.signal?.aborted) {
    throw new BackupCancelledError();
  }
}

function getInternalAvailableSpace(workspacePath: string): number {
  return getAvailableDiskSpace(workspacePath);
}

/**
 * Copy a file while computing its SHA256 hash. Returns the hash.
 */
async function copyFileWithHash(
  src: string,
  dest: string
): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256');
  const fileStat = await stat(src);

  await pipeline(
    createReadStream(src),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(dest)
  );

  return { sha256: hash.digest('hex'), size: fileStat.size };
}

/**
 * Read a previous manifest from a backup directory, if it exists and is valid.
 */
function readPreviousManifest(
  backupDirPath: string
): BackupManifest | undefined {
  try {
    const manifestJson = readFileSync(
      join(backupDirPath, MANIFEST_FILENAME),
      'utf-8'
    );
    const signatureData = readFileSync(
      join(backupDirPath, MANIFEST_SIGNATURE_FILENAME)
    );
    const isValid = validateManifestSignature(manifestJson, signatureData);
    if (!isValid) {
      debug(
        'previous manifest signature invalid, treating as no previous backup'
      );
      return undefined;
    }
    return JSON.parse(manifestJson) as BackupManifest;
  } catch (error) {
    debug('error reading previous manifest: %s', error);
    return undefined;
  }
}

/**
 * Query the database snapshot for all ballot image relative paths.
 * Paths are of the form `<electionDefinitionId>/<cvrId>-<side>`.
 */
function listBallotImagesFromDb(
  snapshotDbPath: string,
  logger: BaseLogger
): string[] {
  const client = DbClient.fileClient(snapshotDbPath, logger);
  const rows = client.all(
    `select
      e.election_data ->> 'id' as electionDefinitionId,
      bi.cvr_id as cvrId,
      bi.side
    from ballot_images bi
    join cvrs c on c.id = bi.cvr_id
    join elections e on e.id = c.election_id`
  ) as Array<{
    electionDefinitionId: string;
    cvrId: string;
    side: string;
  }>;
  return rows.map((r) => join(r.electionDefinitionId, `${r.cvrId}-${r.side}`));
}

/**
 * Back up the database and ballot images to a USB drive.
 *
 * Runs pre-flight checks, copies data, signs a manifest, and validates
 * the result.
 */
export async function performBackup(ctx: BackupContext): Promise<void> {
  const backupRootPath = join(ctx.backupDriveMountPoint, BACKUP_ROOT_DIR);
  const electionDirPath = join(backupRootPath, ctx.electionDirName);
  const inProgressDirPath = join(
    backupRootPath,
    `${ctx.electionDirName}${IN_PROGRESS_SUFFIX}`
  );
  const previousDirPath = join(
    backupRootPath,
    `${ctx.electionDirName}${PREVIOUS_SUFFIX}`
  );

  // Temp database path on internal drive
  const timestamp = new Date().toISOString().replace(/[^\d]/g, '');
  const tempDbPath = join(ctx.workspacePath, `admin-backup-${timestamp}.db`);

  try {
    await doBackup(
      ctx,
      electionDirPath,
      inProgressDirPath,
      previousDirPath,
      tempDbPath
    );
  } catch (error) {
    // Clean up on failure
    await cleanupSafe(tempDbPath);
    await cleanupDirSafe(inProgressDirPath);
    throw error;
  } finally {
    // Always clean up the temp db
    await cleanupSafe(tempDbPath);
  }
}

async function doBackup(
  ctx: BackupContext,
  electionDirPath: string,
  inProgressDirPath: string,
  previousDirPath: string,
  tempDbPath: string
): Promise<void> {
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
    throw new Error(
      'Internal drive has insufficient space for database snapshot. ' +
        `Need ~${formatBytes(dbStat.size)}, available: ${formatBytes(
          internalSpace
        )}.`
    );
  }

  checkCancel(ctx);

  // 2. Copy database using VACUUM INTO
  ctx.onProgress?.({
    phase: 'snapshot',
    imagesTotal: 0,
    imagesCopied: 0,
  });

  debug('creating database snapshot at %s', tempDbPath);
  ctx.backupDatabase(tempDbPath);
  debug('database snapshot complete');

  checkCancel(ctx);

  // 3. Delete backup-related info from the copied database (if any)
  // Currently no backup-specific tables, but this is where we'd clean them

  // 4. Read previous manifest if available
  debug('reading previous manifest from %s', electionDirPath);
  const backupRootPath = join(ctx.backupDriveMountPoint, BACKUP_ROOT_DIR);
  await mkdir(backupRootPath, { recursive: true });

  const previousManifest = readPreviousManifest(electionDirPath);
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
  const allImageFiles = listBallotImagesFromDb(tempDbPath, ctx.logger);
  const newImageFiles: string[] = [];
  let newImagesSize = 0;

  for (const imageRelPath of allImageFiles) {
    const backupImagePath = join(BACKUP_IMAGES_DIR, imageRelPath);
    if (!previousFileMap.has(backupImagePath)) {
      newImageFiles.push(imageRelPath);
      try {
        const imageStat = await stat(join(ctx.ballotImagesPath, imageRelPath));
        newImagesSize += imageStat.size;
      } catch {
        // File might have been deleted between listing and stat
      }
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
    throw new Error(
      `USB drive ran out of space. Available: ${formatBytes(driveSpace)}, ` +
        `required: ${formatBytes(totalNeeded)}.`
    );
  }

  checkCancel(ctx);

  const totalImages = allImageFiles.length;

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

  checkCancel(ctx);

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

  for (const imageRelPath of reusedImageFiles) {
    checkCancel(ctx);

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
      imagesTotal: totalImages,
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
    checkCancel(ctx);

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
      imagesTotal: totalImages,
      imagesCopied,
    });
  }

  checkCancel(ctx);

  debug('all images processed (%d total)', imagesCopied);

  // 5. Create and sign manifest
  debug('signing manifest');
  ctx.onProgress?.({
    phase: 'signing',
    imagesTotal: totalImages,
    imagesCopied: totalImages,
  });

  const manifest: BackupManifest = {
    version: 1,
    electionId: ctx.electionId,
    electionTitle: ctx.electionTitle,
    electionDate: ctx.electionDate,
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

  checkCancel(ctx);

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
    imagesTotal: totalImages,
    imagesCopied: totalImages,
  });

  debug('validating backup');
  await validateBackup(electionDirPath, ctx.softwareVersion);

  debug('backup complete');
}

/**
 * Validate a backup directory by checking the manifest signature and
 * verifying file hashes.
 */
export async function validateBackup(
  backupDirPath: string,
  expectedSoftwareVersion?: string
): Promise<BackupManifest> {
  debug('validate: reading manifest from %s', backupDirPath);
  // 1. Read and verify manifest signature
  const manifestPath = join(backupDirPath, MANIFEST_FILENAME);
  const sigPath = join(backupDirPath, MANIFEST_SIGNATURE_FILENAME);

  const manifestJson = readFileSync(manifestPath, 'utf-8');
  const signatureData = readFileSync(sigPath);

  debug('validate: verifying signature');
  const isValid = validateManifestSignature(manifestJson, signatureData);
  if (!isValid) {
    throw new Error('Backup manifest signature is invalid');
  }

  const manifest: BackupManifest = JSON.parse(manifestJson);
  debug('validate: manifest has %d files', manifest.files.length);

  // 2. Check software version
  if (
    expectedSoftwareVersion &&
    expectedSoftwareVersion !== 'dev' &&
    manifest.softwareVersion !== expectedSoftwareVersion &&
    manifest.softwareVersion !== 'dev'
  ) {
    throw new Error(
      `Backup was created with software version ${manifest.softwareVersion}, ` +
        `but the current version is ${expectedSoftwareVersion}. ` +
        'Backups can only be restored on the exact same version.'
    );
  }

  // 3. Verify file hashes
  debug('validate: verifying %d file hashes', manifest.files.length);
  let verified = 0;
  for (const file of manifest.files) {
    const filePath = join(backupDirPath, file.path);
    const hash = await sha256File(filePath);
    if (hash !== file.sha256) {
      throw new Error(
        `Hash mismatch for ${file.path}: expected ${file.sha256}, got ${hash}`
      );
    }
    verified += 1;
    if (verified % 100 === 0 || verified === manifest.files.length) {
      debug('validate: verified %d/%d files', verified, manifest.files.length);
    }
  }

  debug('validate: all files verified');
  return manifest;
}

/**
 * List all backup entries on a backup drive.
 */
export function listBackups(mountPoint: string): BackupEntry[] {
  const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);

  let dirNames: string[];
  try {
    dirNames = readdirSync(backupRootPath);
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
      const manifestJson = readFileSync(
        join(dirPath, MANIFEST_FILENAME),
        'utf-8'
      );
      const manifest: BackupManifest = JSON.parse(manifestJson);

      // Compute total size
      const totalSize = manifest.files.reduce((sum, f) => sum + f.size, 0);

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
