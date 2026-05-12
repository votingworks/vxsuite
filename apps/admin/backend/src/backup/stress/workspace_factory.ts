import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { assertDefined } from '@votingworks/basics';
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  electionGeneralFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { BaseLogger, mockBaseLogger } from '@votingworks/logging';
import { DEFAULT_SYSTEM_SETTINGS, Side } from '@votingworks/types';
// eslint-disable-next-line import/no-extraneous-dependencies
import { vi } from 'vitest';

import { Store } from '../../store';
import {
  createWorkspace,
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../../util/workspace';
import {
  BackupContext,
  listBackups,
  performBackup,
  validateBackup,
} from '../backup';
import { performRestore, RestoreContext } from '../restore';
import { BACKUP_ROOT_DIR, BackupManifest } from '../types';

/** The election definition ID from electionGeneralFixtures. */
const ELECTION_DEFINITION_ID = 'election-general';

/** Valid precinct IDs from the general election fixture. */
const PRECINCT_IDS = ['23', '21', '20'];

/** Valid ballot style group IDs from the general election fixture. */
const BALLOT_STYLE_GROUP_IDS = ['1', '2', '3', '4', '5'];

/** Options for creating a populated test workspace. */
export interface WorkspaceFactoryOptions {
  /** Number of scanner batches to create (default: 1). */
  batchCount?: number;
  /** Number of CVRs per batch (default: 1). */
  cvrsPerBatch?: number;
  /** Number of ballot images per CVR: 0, 1, or 2 (default: 1). */
  imagesPerCvr?: number;
  /** Min/max bytes for random image data (default: [1000, 5000]). */
  imageSizeRange?: [number, number];
}

/** A workspace populated with election data, CVRs, and ballot images. */
export interface PopulatedWorkspace {
  workspacePath: string;
  dbPath: string;
  ballotImagesPath: string;
  logger: BaseLogger;
  store: Store;
  electionId: string;
  backupDatabase: (destPath: string) => void;
  totalImages: number;
  cvrIds: string[];
}

/**
 * Creates a workspace populated with election data, CVRs, and ballot images.
 * Uses real Store methods so the database is fully consistent.
 */
export function createPopulatedWorkspace(
  options: WorkspaceFactoryOptions = {}
): PopulatedWorkspace {
  const {
    batchCount = 1,
    cvrsPerBatch = 1,
    imagesPerCvr = 1,
    imageSizeRange = [1000, 5000],
  } = options;

  const workspacePath = makeTemporaryDirectory();
  const logger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(workspacePath, logger);
  const { store } = workspace;

  const { electionData } = electionGeneralFixtures.readElectionDefinition();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-hash',
  });
  store.setCurrentElectionId(electionId);

  const dbPath = join(workspacePath, WORKSPACE_DB_FILENAME);
  const ballotImagesPath = join(workspacePath, WORKSPACE_BALLOT_IMAGES_DIR);

  store.addCastVoteRecordFileRecord({
    id: 'cvr-file-1',
    electionId,
    isTestMode: false,
    filename: 'stress-test.jsonl',
    exportedTimestamp: new Date().toISOString(),
    sha256Hash: 'stress-test-hash',
    scannerIds: new Set(['scanner-1']),
  });

  const cvrIds: string[] = [];
  let imageCount = 0;

  for (let b = 0; b < batchCount; b += 1) {
    const batchId = `batch-${b}`;
    store.addScannerBatch({
      batchId,
      label: `Batch ${b}`,
      scannerId: 'scanner-1',
      electionId,
      startedAt: new Date().toISOString(),
    });

    for (let c = 0; c < cvrsPerBatch; c += 1) {
      const ballotId = `ballot-${b}-${c}`;
      const precinctId = assertDefined(
        PRECINCT_IDS[c % PRECINCT_IDS.length]
      );
      const ballotStyleGroupId = assertDefined(
        BALLOT_STYLE_GROUP_IDS[c % BALLOT_STYLE_GROUP_IDS.length]
      );

      const { cvrId } = store
        .addCastVoteRecordFileEntry({
          electionId,
          cvrFileId: 'cvr-file-1',
          ballotId,
          cvr: {
            ballotStyleGroupId,
            batchId,
            precinctId,
            votingMethod: 'precinct',
            card: { type: 'bmd' },
            votes: {},
          },
          adjudicationFlags: {
            isBlank: false,
            hasOvervote: false,
            hasUndervote: false,
            hasWriteIn: false,
          },
        })
        .unsafeUnwrap();

      cvrIds.push(cvrId);

      const sides: Side[] =
        imagesPerCvr === 2
          ? ['front', 'back']
          : imagesPerCvr === 1
            ? ['front']
            : [];

      for (const side of sides) {
        const [minSize, maxSize] = imageSizeRange;
        const size =
          minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
        store.addBallotImage({
          cvrId,
          electionDefinitionId: ELECTION_DEFINITION_ID,
          imageData: randomBytes(size),
          side,
        });
        imageCount += 1;
      }
    }
  }

  function backupDatabase(destPath: string): void {
    store.backup(destPath);
  }

  return {
    workspacePath,
    dbPath,
    ballotImagesPath,
    logger,
    store,
    electionId,
    backupDatabase,
    totalImages: imageCount,
    cvrIds,
  };
}

/** Builds a BackupContext from a PopulatedWorkspace. */
export function createBackupContext(
  workspace: PopulatedWorkspace,
  mountPoint: string,
  overrides?: Partial<BackupContext>
): BackupContext {
  const base: BackupContext = {
    workspacePath: workspace.workspacePath,
    dbPath: workspace.dbPath,
    ballotImagesPath: workspace.ballotImagesPath,
    backupDriveMountPoint: mountPoint,
    machineId: 'STRESS-TEST',
    softwareVersion: 'dev',
    logger: workspace.logger,
    backupDatabase: workspace.backupDatabase,
  };
  if (!overrides) return base;
  return Object.assign(base, overrides);
}

/** Performs a backup and returns the validated manifest. */
export async function backupAndValidate(
  workspace: PopulatedWorkspace,
  mountPoint: string,
  overrides?: Partial<BackupContext>
): Promise<{ manifest: BackupManifest; backupDirName: string }> {
  const ctx = createBackupContext(workspace, mountPoint, overrides);
  (await performBackup(ctx)).unsafeUnwrap();

  const entries = await listBackups(mountPoint);
  const entry = assertDefined(entries[0]);

  const backupDir = join(mountPoint, BACKUP_ROOT_DIR, entry.directoryName);
  const manifest = (await validateBackup(backupDir)).unsafeUnwrap();

  return { manifest, backupDirName: entry.directoryName };
}

/**
 * Restores a backup to a fresh workspace and returns the workspace path.
 */
export async function restoreToNewWorkspace(
  mountPoint: string,
  backupDirName: string,
  logger: BaseLogger
): Promise<string> {
  const newWorkspacePath = makeTemporaryDirectory();
  const newBallotImagesPath = join(
    newWorkspacePath,
    WORKSPACE_BALLOT_IMAGES_DIR
  );

  const restoreCtx: RestoreContext = {
    workspacePath: newWorkspacePath,
    dbPath: join(newWorkspacePath, WORKSPACE_DB_FILENAME),
    ballotImagesPath: newBallotImagesPath,
    backupDriveMountPoint: mountPoint,
    backupDirectoryName: backupDirName,
    softwareVersion: 'dev',
    logger,
  };

  (await performRestore(restoreCtx)).unsafeUnwrap();
  return newWorkspacePath;
}

/**
 * Collects all files under a directory recursively, returning
 * a map of relative paths to file contents.
 */
export async function collectFiles(
  rootDir: string
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), relPath);
      } else {
        const content = await readFile(join(dir, entry.name));
        files.set(relPath, content);
      }
    }
  }

  await walk(rootDir, '');
  return files;
}

/**
 * Verifies a round-trip: backup → restore → compare ballot images.
 */
export async function verifyRoundTrip(
  workspace: PopulatedWorkspace,
  mountPoint: string,
  backupDirName: string
): Promise<void> {
  const restoredPath = await restoreToNewWorkspace(
    mountPoint,
    backupDirName,
    workspace.logger
  );

  const originalImages = await collectFiles(workspace.ballotImagesPath);
  const restoredImages = await collectFiles(
    join(restoredPath, WORKSPACE_BALLOT_IMAGES_DIR)
  );

  if (originalImages.size !== restoredImages.size) {
    throw new Error(
      `Image count mismatch: original=${originalImages.size}, restored=${restoredImages.size}`
    );
  }

  for (const [path, originalContent] of originalImages) {
    const restoredContent = restoredImages.get(path);
    if (!restoredContent) {
      throw new Error(`Missing restored image: ${path}`);
    }
    if (!originalContent.equals(restoredContent)) {
      throw new Error(`Image content mismatch: ${path}`);
    }
  }
}
