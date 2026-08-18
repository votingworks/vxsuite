import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { prepareSignatureFile } from '@votingworks/auth';
import { getDiskSpaceSummary } from '@votingworks/backend';
import { syncFilesystem } from '@votingworks/usb-drive';
import {
  assertDefined,
  err,
  extractErrorMessage,
  iter,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  dropPageCache,
  exchangePaths,
  renameNoReplace,
  SyscallError,
} from '@votingworks/fs';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { format, generateElectionBasedSubfolderName } from '@votingworks/utils';
import {
  BACKUP_MANIFEST_VERSION,
  BACKUPS_DIRECTORY_NAME,
  backupFilePath,
  BackupManifest,
  BackupManifestFile,
  IN_PROGRESS_DIRECTORY_SUFFIX,
  manifestPath,
} from './manifest.js';
import {
  BackupValidationError,
  formatBackupValidationError,
  validateBackup,
} from './validate_backup.js';
import {
  createReadStream,
  createWriteStream,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from './fs.js';
import { MachineConfig } from '../types.js';
import { Workspace } from '../util/workspace.js';

/**
 * How much more space than the backup needs must be free on a disk before we
 * start writing to it. Running a drive completely full is a good way to fail
 * in the middle of a write.
 */
const FREE_SPACE_MARGIN_RATIO = 1.05;

/**
 * The name a database snapshot is written under while a backup is running.
 */
const SNAPSHOT_NAME_REGEX = /^backup-tmp-\d+\.db$/;

/**
 * Progress within a backup. Only the stages that read or write every file can
 * say how far along they are, so only those carry byte counts.
 */
export type BackupProgress =
  | { step: 'checking_space' }
  | { step: 'snapshotting_database' }
  | { step: 'copying_files'; bytesCompleted: number; bytesTotal: number }
  | { step: 'signing' }
  | { step: 'flushing' }
  | { step: 'swapping' }
  | { step: 'validating'; bytesCompleted: number; bytesTotal: number };

/**
 * The stages of a backup. Reported to callers so they can tell a person what
 * the machine is doing.
 */
export type BackupStep = BackupProgress['step'];

/**
 * A reason a backup couldn't be made.
 */
export type BackupError =
  | { type: 'no_election_configured' }
  | {
      type: 'target_unusable';
      path: string;
      message: string;
    }
  | {
      type: 'target_unsupported_filesystem';
      path: string;
      message: string;
    }
  | {
      type: 'insufficient_space';
      location: 'workspace' | 'target';
      requiredBytes: number;
      availableBytes: number;
    }
  | {
      type: 'workspace_unreadable';
      path: string;
      message: string;
    }
  | { type: 'unsupported_workspace_entry'; path: string }
  | { type: 'database_snapshot_failed'; message: string }
  | {
      type: 'copy_failed';
      path: string;
      message: string;
    }
  | { type: 'signing_failed'; message: string }
  | { type: 'flush_failed'; message: string }
  | { type: 'swap_failed'; message: string }
  | {
      type: 'validation_failed';
      error: BackupValidationError;
    };

/**
 * Renders a {@link BackupError} for a person to read.
 */
export function formatBackupError(error: BackupError): string {
  switch (error.type) {
    case 'no_election_configured':
      return 'No election is configured, so there is nothing to back up.';
    case 'target_unusable':
      return `The backup drive at ${error.path} cannot be written to: ${error.message}`;
    case 'target_unsupported_filesystem':
      return (
        `The backup drive at ${error.path} uses a filesystem that cannot ` +
        `safely swap a new backup into place: ${error.message}. Use a backup ` +
        `drive formatted with ext4.`
      );
    case 'insufficient_space':
      return (
        `Not enough free space on the ${error.location}: ` +
        `${format.bytes(error.requiredBytes)} are needed but only ` +
        `${format.bytes(error.availableBytes)} are free.`
      );
    case 'workspace_unreadable':
      return `The workspace at ${error.path} could not be read: ${error.message}`;
    case 'unsupported_workspace_entry':
      return (
        `${error.path} is not a regular file, so it cannot be backed up. ` +
        `Remove it from the workspace, or replace it with the file it points to.`
      );
    case 'database_snapshot_failed':
      return `The election database could not be copied: ${error.message}`;
    case 'copy_failed':
      return `${error.path} could not be written to the backup drive: ${error.message}`;
    case 'signing_failed':
      return `The backup manifest could not be signed: ${error.message}`;
    case 'flush_failed':
      return `The backup could not be written out to the drive: ${error.message}`;
    case 'swap_failed':
      return `The new backup could not be moved into place: ${error.message}`;
    case 'validation_failed':
      return `The backup was written but did not verify: ${formatBackupValidationError(
        error.error
      )}`;
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      return throwIllegalValue(error, 'type');
  }
}

/**
 * A backup that was created successfully.
 */
export interface BackupSummary {
  backupDirectoryPath: string;
  manifest: BackupManifest;
}

/**
 * Files in the workspace that a backup never copies as-is: the live database,
 * whose snapshot is copied instead, its transient sidecars, and the snapshots
 * themselves.
 *
 * `libs/db` leaves SQLite in its default `delete` journal mode, so the sidecar
 * that appears is `data.db-journal`, not the `-wal`/`-shm` pair. It exists only
 * while a transaction is open, which on a stopped VxAdmin means only after a
 * crash — and then it belongs to the database it was left beside, not to the
 * snapshot a restore would write, so copying it would be worse than useless.
 * The other two are excluded anyway, cheaply, against the day someone turns WAL
 * on.
 */
function isExcludedFromBackup(relativePath: string): boolean {
  return (
    relativePath === 'data.db' ||
    relativePath === 'data.db-journal' ||
    relativePath === 'data.db-wal' ||
    relativePath === 'data.db-shm' ||
    SNAPSHOT_NAME_REGEX.test(relativePath)
  );
}

/**
 * Deletes database snapshots left in the workspace by runs that were killed
 * before they could clean up after themselves. Each run names its snapshot after
 * the clock, so nothing else would ever remove them, and they are full copies of
 * the election database: enough of them fills the internal disk, and the
 * free-space check only ever reserves room for one more.
 */
async function removeStaleSnapshots(workspacePath: string): Promise<void> {
  const entries = await readdir(workspacePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && SNAPSHOT_NAME_REGEX.test(entry.name)) {
      await rmQuietly(join(workspacePath, entry.name));
    }
  }
}

/**
 * What a workspace holds: the files to copy, and anything that isn't a file or a
 * directory. VxAdmin workspaces contain neither symlinks nor special files, and
 * a backup that quietly skipped one would be missing data that nothing would
 * notice — the manifest and the directory would agree with each other, so
 * validation would pass and a restore would silently come up short.
 */
interface WorkspaceListing {
  files: string[];
  unsupported: string[];
}

async function listWorkspaceFiles(
  workspacePath: string
): Promise<WorkspaceListing> {
  const entries = await readdir(workspacePath, {
    withFileTypes: true,
    recursive: true,
  });
  const files: string[] = [];
  const unsupported: string[] = [];
  for (const entry of entries) {
    const relativePath = relative(
      workspacePath,
      join(entry.parentPath, entry.name)
    )
      .split(sep)
      .join('/');
    if (isExcludedFromBackup(relativePath)) {
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    } else if (!entry.isDirectory()) {
      unsupported.push(relativePath);
    }
  }
  return { files: [...files].sort(), unsupported: [...unsupported].sort() };
}

async function rmQuietly(
  path: string,
  options: { recursive?: boolean } = {}
): Promise<void> {
  try {
    await rm(path, { ...options, force: true });
  } catch {
    // Nothing useful to do about a failed cleanup.
  }
}

/**
 * Proves the drive can atomically exchange two paths, which is how the swap at
 * the end replaces an existing backup, by exchanging two empty files. Not
 * every filesystem supports the operation (FAT32 does not, failing with
 * EINVAL), and the plain rename that takes a free name works everywhere — so
 * without this check, an unsupported drive would accept its first backup and
 * then fail every later one, after all the copying, at the swap.
 */
async function probeExchangeSupport(
  directoryPath: string
): Promise<Result<void, SyscallError>> {
  const pathA = join(directoryPath, '.exchange-probe-a');
  const pathB = join(directoryPath, '.exchange-probe-b');
  try {
    await writeFile(pathA, '');
    await writeFile(pathB, '');
    return exchangePaths(pathA, pathB);
  } finally {
    await rmQuietly(pathA);
    await rmQuietly(pathB);
  }
}

async function copyFileAndHash({
  sourcePath,
  destinationPath,
  onBytesCopied,
}: {
  sourcePath: string;
  destinationPath: string;
  onBytesCopied: (byteCount: number) => void;
}): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  const hashingStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      size += chunk.length;
      onBytesCopied(chunk.length);
      callback(null, chunk);
    },
  });
  await mkdir(dirname(destinationPath), { recursive: true });
  await pipeline(
    createReadStream(sourcePath),
    hashingStream,
    createWriteStream(destinationPath)
  );
  return { sha256: hash.digest('hex'), size };
}

async function assertFreeSpace({
  path,
  location,
  requiredBytes,
}: {
  path: string;
  location: 'workspace' | 'target';
  requiredBytes: number;
}): Promise<Result<void, BackupError>> {
  let available: number;
  try {
    ({ available } = await getDiskSpaceSummary([path]));
  } catch (error) {
    // `df` fails on a drive that has been pulled, which is a backup failure
    // like any other rather than something to throw past the caller.
    return err(
      location === 'workspace'
        ? {
            type: 'workspace_unreadable',
            path,
            message: extractErrorMessage(error),
          }
        : {
            type: 'target_unusable',
            path,
            message: extractErrorMessage(error),
          }
    );
  }
  const availableBytes = available * 1024;
  const requiredBytesWithMargin = Math.ceil(
    requiredBytes * FREE_SPACE_MARGIN_RATIO
  );
  if (availableBytes < requiredBytesWithMargin) {
    return err({
      type: 'insufficient_space',
      location,
      requiredBytes: requiredBytesWithMargin,
      availableBytes,
    });
  }
  return ok();
}

/**
 * Writes a complete, signed backup of the workspace to `targetDirectoryPath`,
 * replacing any previous backup of the same election on that drive.
 *
 * Every hash in the manifest is computed from bytes read off the internal disk
 * as they are written out, never from bytes read back from the drive, so a
 * drive that lies about what it stored can only make the backup fail to
 * validate, never get bad data signed.
 */
export async function createBackup({
  workspace,
  targetDirectoryPath,
  machineConfig,
  logger,
  onProgress,
}: {
  workspace: Workspace;
  targetDirectoryPath: string;
  machineConfig: MachineConfig;
  logger: BaseLogger;
  onProgress?: (progress: BackupProgress) => void;
}): Promise<Result<BackupSummary, BackupError>> {
  const { store } = workspace;

  logger.log(LogEventId.BackupCreateInit, 'system', {
    message: `Backing up election data to ${targetDirectoryPath}.`,
  });

  function logFailure(error: BackupError): Result<never, BackupError> {
    logger.log(LogEventId.BackupCreateComplete, 'system', {
      message: formatBackupError(error),
      disposition: 'failure',
    });
    return err(error);
  }

  const electionId = store.getCurrentElectionId();
  if (electionId === undefined) {
    return logFailure({ type: 'no_election_configured' });
  }
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const backupDirectoryName = generateElectionBasedSubfolderName(
    election,
    electionDefinition.ballotHash
  );
  const backupsDirectoryPath = join(
    targetDirectoryPath,
    BACKUPS_DIRECTORY_NAME
  );
  const backupDirectoryPath = join(backupsDirectoryPath, backupDirectoryName);
  const inProgressDirectoryPath = `${backupDirectoryPath}${IN_PROGRESS_DIRECTORY_SUFFIX}`;
  const snapshotPath = join(workspace.path, `backup-tmp-${Date.now()}.db`);

  let loggedStep: BackupStep | undefined;
  function reportProgress(progress: BackupProgress): void {
    // Callers get every update so they can render live progress, but the log
    // gets one line per step: a backup that dies part way through should record
    // how far it got, without a line per file to get there.
    if (progress.step !== loggedStep) {
      loggedStep = progress.step;
      logger.log(LogEventId.BackupCreateProgress, 'system', {
        message: `Backup reached the ${progress.step} stage.`,
        step: progress.step,
        ...('bytesTotal' in progress
          ? { bytesTotal: progress.bytesTotal }
          : {}),
      });
    }
    onProgress?.(progress);
  }

  async function fail(error: BackupError): Promise<Result<never, BackupError>> {
    // Cleanup is best effort: we're already failing, and whatever made us fail
    // (an unusable target, a drive that was pulled out) may make it impossible.
    await rmQuietly(snapshotPath);
    await rmQuietly(inProgressDirectoryPath, { recursive: true });
    return logFailure(error);
  }

  reportProgress({ step: 'checking_space' });
  try {
    await mkdir(backupsDirectoryPath, { recursive: true });

    // Fail a drive that can't do the swap at the end now, before minutes are
    // spent copying to it.
    const probeResult = await probeExchangeSupport(backupsDirectoryPath);
    if (probeResult.isErr()) {
      const { code, message } = probeResult.err();
      return await fail(
        code === 'EINVAL' || code === 'ENOSYS'
          ? {
              type: 'target_unsupported_filesystem',
              path: targetDirectoryPath,
              message,
            }
          : {
              type: 'target_unusable',
              path: targetDirectoryPath,
              message,
            }
      );
    }

    // A leftover `-in-progress` directory is a partial write, or a replaced
    // backup whose deletion failed after the swap below. Never a valid restore
    // source either way, and this run is about to reuse its name.
    await rm(inProgressDirectoryPath, { force: true, recursive: true });
  } catch (error) {
    return fail({
      type: 'target_unusable',
      path: targetDirectoryPath,
      message: extractErrorMessage(error),
    });
  }

  // Measuring reads the workspace and asks `df` about two filesystems, either
  // of which can fail on a drive that was pulled or a file that went away.
  // Those are backup failures like any other, not exceptions to throw past the
  // caller, which would skip the log line saying how far this got.
  let workspaceFiles: string[];
  let unsupportedEntries: string[];
  let databaseSize: number;
  let workspaceFilesBytes: number;
  try {
    ({ files: workspaceFiles, unsupported: unsupportedEntries } =
      await listWorkspaceFiles(workspace.path));
    const workspaceFileSizes = await Promise.all(
      workspaceFiles.map(async (relativePath) => {
        const { size } = await stat(join(workspace.path, relativePath));
        return size;
      })
    );
    ({ size: databaseSize } = await stat(store.getDbPath()));
    workspaceFilesBytes = iter(workspaceFileSizes).sum();
  } catch (error) {
    return fail({
      type: 'workspace_unreadable',
      path: workspace.path,
      message: extractErrorMessage(error),
    });
  }

  if (unsupportedEntries.length > 0) {
    return fail({
      type: 'unsupported_workspace_entry',
      path: assertDefined(unsupportedEntries[0]),
    });
  }

  // The snapshot lands on the internal disk alongside the database it copies.
  const workspaceSpaceResult = await assertFreeSpace({
    path: workspace.path,
    location: 'workspace',
    requiredBytes: databaseSize,
  });
  if (workspaceSpaceResult.isErr()) {
    return fail(workspaceSpaceResult.err());
  }
  // The snapshot is usually smaller than the database it copies, so this asks
  // for more room than the backup will use rather than less.
  const targetSpaceResult = await assertFreeSpace({
    path: targetDirectoryPath,
    location: 'target',
    requiredBytes: databaseSize + workspaceFilesBytes,
  });
  if (targetSpaceResult.isErr()) {
    return fail(targetSpaceResult.err());
  }

  reportProgress({ step: 'snapshotting_database' });
  let bytesTotal: number;
  try {
    await removeStaleSnapshots(workspace.path);
    store.backupDatabase(snapshotPath);
    // Measured from the snapshot rather than the database it came from: a
    // `VACUUM INTO` is usually smaller, and a progress bar whose total is the
    // wrong one never reaches its end. This is also exactly what the manifest
    // will record, so validation counts the same bytes back.
    const { size: snapshotSize } = await stat(snapshotPath);
    bytesTotal = snapshotSize + workspaceFilesBytes;
  } catch (error) {
    return fail({
      type: 'database_snapshot_failed',
      message: extractErrorMessage(error),
    });
  }

  let bytesCompleted = 0;
  function onBytesCopied(byteCount: number): void {
    bytesCompleted += byteCount;
    reportProgress({ step: 'copying_files', bytesCompleted, bytesTotal });
  }

  reportProgress({ step: 'copying_files', bytesCompleted: 0, bytesTotal });
  const files: BackupManifestFile[] = [];
  let copying = 'data.db';
  try {
    const database = await copyFileAndHash({
      sourcePath: snapshotPath,
      destinationPath: backupFilePath(inProgressDirectoryPath, 'data.db'),
      onBytesCopied,
    });
    files.push({ path: 'data.db', ...database });

    for (const relativePath of workspaceFiles) {
      copying = relativePath;
      const copied = await copyFileAndHash({
        sourcePath: join(workspace.path, relativePath),
        destinationPath: backupFilePath(inProgressDirectoryPath, relativePath),
        onBytesCopied,
      });
      files.push({ path: relativePath, ...copied });
    }
  } catch (error) {
    return fail({
      type: 'copy_failed',
      path: copying,
      message: extractErrorMessage(error),
    });
  }

  const manifest: BackupManifest = {
    version: BACKUP_MANIFEST_VERSION,
    softwareVersion: machineConfig.codeVersion,
    machineId: machineConfig.machineId,
    createdAt: new Date().toISOString(),
    election: {
      id: electionId,
      title: election.title,
      date: election.date.toISOString(),
    },
    files,
  };
  const manifestFileContents = JSON.stringify(manifest, undefined, 2);

  reportProgress({ step: 'signing' });
  try {
    await writeFile(
      manifestPath(inProgressDirectoryPath),
      manifestFileContents
    );
    const signatureFile = await prepareSignatureFile({
      type: 'vxadmin_backup',
      context: 'export',
      manifestFileContents,
    });
    const signatureFilePath = join(
      inProgressDirectoryPath,
      signatureFile.fileName
    );
    await writeFile(signatureFilePath, signatureFile.fileContents);
  } catch (error) {
    return fail({
      type: 'signing_failed',
      message: extractErrorMessage(error),
    });
  }

  // Push everything written so far out to the device, then evict it all from
  // the page cache. `syncfs(2)` writes dirty pages to the drive but leaves
  // them in the cache as clean pages, so without the eviction the validation
  // read-back below would be served from RAM — able to catch a manifest that
  // doesn't describe what was written, but never a drive that didn't store the
  // bytes. Evicted, the read-back comes from the device: validation checks the
  // drive's copy of the backup, not this machine's memory of writing it.
  // (`posix_fadvise` is advisory, but nothing else holds freshly-written clean
  // pages, so eviction is what it does.)
  reportProgress({ step: 'flushing' });
  let writtenFilePaths: string[];
  try {
    await syncFilesystem(targetDirectoryPath);
    const writtenEntries = await readdir(inProgressDirectoryPath, {
      withFileTypes: true,
      recursive: true,
    });
    writtenFilePaths = writtenEntries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
  } catch (error) {
    return fail({ type: 'flush_failed', message: extractErrorMessage(error) });
  }
  for (const writtenFilePath of writtenFilePaths) {
    const dropResult = await dropPageCache(writtenFilePath);
    if (dropResult.isErr()) {
      return fail({
        type: 'flush_failed',
        message: `${writtenFilePath}: ${dropResult.err().message}`,
      });
    }
  }

  // Validation happens before the swap, not after: it exists to catch a drive
  // that didn't store what it was given, and a drive like that must not cost a
  // jurisdiction the backup it already had. Failing here leaves the previous
  // backup untouched under its own name. The signature covers the manifest's
  // bytes and not its location, so a backup verifies just as well here as it
  // will under its final name.
  reportProgress({ step: 'validating', bytesCompleted: 0, bytesTotal });
  const validationResult = await validateBackup({
    backupDirectoryPath: inProgressDirectoryPath,
    expectedSoftwareVersion: machineConfig.codeVersion,
    onProgress: (validationProgress) =>
      reportProgress({ step: 'validating', ...validationProgress }),
  });
  if (validationResult.isErr()) {
    return fail({ type: 'validation_failed', error: validationResult.err() });
  }

  // Take the backup's final name: claim it outright if it is free, and
  // otherwise atomically exchange the new backup with whatever holds it —
  // normally last time's backup, which lands under the `-in-progress` name for
  // the cleanup below. Neither operation moves anything when it fails, and
  // neither leaves any instant where the drive has no backup under the name
  // `list` and a restore look for.
  reportProgress({ step: 'swapping' });
  const claimResult = renameNoReplace(
    inProgressDirectoryPath,
    backupDirectoryPath
  );
  const swapResult =
    claimResult.isErr() && claimResult.err().code === 'EEXIST'
      ? exchangePaths(inProgressDirectoryPath, backupDirectoryPath)
      : claimResult;
  if (swapResult.isErr()) {
    return fail({
      type: 'swap_failed',
      message: swapResult.err().message,
    });
  }

  // Past this point the backup is complete and under its final name. Deleting
  // last time's copy and flushing are both worth reporting if they fail, but
  // neither makes this a failed backup, and saying so would send someone looking
  // for a backup that is actually there.
  const leftovers: string[] = [];
  try {
    await rm(inProgressDirectoryPath, { force: true, recursive: true });
  } catch (error) {
    leftovers.push(
      `${inProgressDirectoryPath} could not be deleted: ${extractErrorMessage(
        error
      )}`
    );
  }

  try {
    await syncFilesystem(targetDirectoryPath);
  } catch (error) {
    leftovers.push(
      `the drive could not be flushed: ${extractErrorMessage(error)}. Do not ` +
        `remove the drive until the machine is shut down`
    );
  }

  if (leftovers.length > 0) {
    logger.log(LogEventId.BackupCreateComplete, 'system', {
      message:
        `Backed up election data to ${backupDirectoryPath}, but ` +
        `${leftovers.join('; and ')}.`,
      disposition: 'failure',
    });
  }

  // Quietly: the backup is already complete, and a stale snapshot is exactly
  // what `removeStaleSnapshots` exists to catch next time.
  await rmQuietly(snapshotPath);

  logger.log(LogEventId.BackupCreateComplete, 'system', {
    message: `Backed up election data to ${backupDirectoryPath}.`,
    disposition: 'success',
  });

  return ok({ backupDirectoryPath, manifest });
}
