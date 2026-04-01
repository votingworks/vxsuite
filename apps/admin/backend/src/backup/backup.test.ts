import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, test, vi } from 'vitest';
import { assertDefined, err } from '@votingworks/basics';
import {
  electionGeneralFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  BallotId,
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';

import { createWorkspace } from '../util/workspace';
import { listBackups, performBackup, validateBackup } from './backup';
import { signManifest } from './signing';
import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupManifest,
  MANIFEST_FILENAME,
  MANIFEST_SIGNATURE_FILENAME,
} from './types';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Create a workspace with a configured election, returning paths and a backupDatabase fn. */
function createTestWorkspace() {
  const workspacePath = makeTemporaryDirectory();
  const logger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(workspacePath, logger);

  const { electionData } = electionGeneralFixtures.readElectionDefinition();
  const electionId = workspace.store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-hash',
  });
  workspace.store.setCurrentElectionId(electionId);

  const dbPath = join(workspacePath, 'data.db');
  const ballotImagesPath = join(workspacePath, 'ballot-images');

  function backupDatabase(destPath: string): void {
    workspace.store.backup(destPath);
  }

  return {
    workspacePath,
    dbPath,
    ballotImagesPath,
    logger,
    backupDatabase,
    store: workspace.store,
    electionId,
  };
}

async function createManifest(
  backupDir: string,
  overrides: Partial<BackupManifest> = {}
): Promise<BackupManifest> {
  await mkdir(backupDir, { recursive: true });
  await mkdir(join(backupDir, BACKUP_IMAGES_DIR), { recursive: true });

  const dbContent = 'db-content';
  await writeFile(join(backupDir, BACKUP_DB_FILENAME), dbContent);

  const manifest: BackupManifest = {
    version: 1,
    electionId: 'e1',
    electionTitle: 'Test',
    electionDate: '2026-01-01',
    machineId: 'VX-001',
    softwareVersion: 'dev',
    createdAt: '2026-01-01T00:00:00.000Z',
    files: [
      {
        path: BACKUP_DB_FILENAME,
        sha256: sha256(dbContent),
        size: Buffer.byteLength(dbContent),
      },
    ],
    ...overrides,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  await writeFile(join(backupDir, MANIFEST_FILENAME), manifestJson);
  await writeFile(
    join(backupDir, MANIFEST_SIGNATURE_FILENAME),
    signManifest(manifestJson)
  );

  return manifest;
}

describe('validateBackup', () => {
  test('rejects software version mismatch', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    await createManifest(backupDir, { softwareVersion: '1.0.0' });

    const result = await validateBackup(backupDir, '2.0.0');
    expect(result).toEqual(
      err({
        type: 'mismatchedSoftwareVersion',
        expected: '2.0.0',
        actual: '1.0.0',
      })
    );
  });

  test('allows dev version bypass', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    await createManifest(backupDir, { softwareVersion: 'dev' });

    const manifest = (await validateBackup(backupDir, '2.0.0')).unsafeUnwrap();
    expect(manifest.softwareVersion).toEqual('dev');
  });

  test('allows when current version is dev', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    await createManifest(backupDir, { softwareVersion: '1.0.0' });

    const manifest = (await validateBackup(backupDir, 'dev')).unsafeUnwrap();
    expect(manifest.softwareVersion).toEqual('1.0.0');
  });

  test('rejects missing manifest', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    await mkdir(backupDir, { recursive: true });

    await expect(validateBackup(backupDir)).rejects.toThrow('ENOENT');
  });

  test('rejects missing signature', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, MANIFEST_FILENAME), '{}');

    await expect(validateBackup(backupDir)).rejects.toThrow('ENOENT');
  });

  test('rejects tampered file hash', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    await createManifest(backupDir);

    await writeFile(join(backupDir, BACKUP_DB_FILENAME), 'tampered');

    const result = await validateBackup(backupDir);
    if (result.isErr()) {
      expect(result.err().type).toEqual('invalidFileHash');
    } else {
      throw new Error('Expected validateBackup to return an error');
    }
  });
});

describe('listBackups', () => {
  test('returns empty for non-existent root', async () => {
    expect(await listBackups('/nonexistent')).toEqual([]);
  });

  test('skips in-progress and previous directories', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupRoot = join(tmpDir, BACKUP_ROOT_DIR);

    const inProgress = join(backupRoot, 'election-in-progress');
    await mkdir(inProgress, { recursive: true });
    await writeFile(join(inProgress, MANIFEST_FILENAME), '{}');

    const previous = join(backupRoot, 'election-previous');
    await mkdir(previous, { recursive: true });
    await writeFile(join(previous, MANIFEST_FILENAME), '{}');

    await createManifest(join(backupRoot, 'election-good'));

    const backups = await listBackups(tmpDir);
    expect(backups.length).toEqual(1);
    expect(assertDefined(backups[0]).directoryName).toEqual('election-good');
  });

  test('skips directories without manifests', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupRoot = join(tmpDir, BACKUP_ROOT_DIR);
    await mkdir(join(backupRoot, 'empty-dir'), { recursive: true });

    expect(await listBackups(tmpDir)).toEqual([]);
  });
});

describe('performBackup', () => {
  test('creates a valid backup', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();
    const mountPoint = makeTemporaryDirectory();

    (
      await performBackup({
        workspacePath,
        dbPath,
        ballotImagesPath,
        backupDriveMountPoint: mountPoint,
        machineId: 'VX-001',
        softwareVersion: 'dev',
        logger,
        backupDatabase,
      })
    ).unsafeUnwrap();

    const [backupEntry] = await listBackups(mountPoint);
    const backupDir = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      assertDefined(backupEntry).directoryName
    );
    expect((await stat(join(backupDir, MANIFEST_FILENAME))).isFile()).toEqual(
      true
    );
    expect((await stat(join(backupDir, BACKUP_DB_FILENAME))).isFile()).toEqual(
      true
    );

    const manifest = (await validateBackup(backupDir)).unsafeUnwrap();
    expect(manifest.electionTitle).toEqual('General Election');
  });

  test('handles cancellation during backup', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();
    const mountPoint = makeTemporaryDirectory();

    const result = await performBackup({
      workspacePath,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      machineId: 'VX-001',
      softwareVersion: 'dev',
      logger,
      backupDatabase,
      signal: AbortSignal.abort(),
    });
    expect(result).toEqual(err({ type: 'cancelled' }));

    const [backupEntry] = await listBackups(mountPoint);
    expect(backupEntry).toBeUndefined();
  });

  test('backup with images deduplicates from previous backup', async () => {
    const {
      workspacePath,
      dbPath,
      ballotImagesPath,
      logger,
      backupDatabase,
      store,
      electionId,
    } = createTestWorkspace();

    // Add a ballot image using Store methods
    store.addScannerBatch({
      batchId: 'b1',
      label: 'Batch 1',
      scannerId: 'scanner-1',
      electionId,
      startedAt: new Date().toISOString(),
    });
    store.addCastVoteRecordFileRecord({
      id: 'cvr-file-1',
      electionId,
      isTestMode: false,
      filename: 'test.jsonl',
      exportedTimestamp: new Date().toISOString(),
      sha256Hash: 'abc123',
      scannerIds: new Set(['scanner-1']),
    });
    const { cvrId } = store
      .addCastVoteRecordFileEntry({
        electionId,
        cvrFileId: 'cvr-file-1',
        ballotId: 'ballot-1' as BallotId,
        cvr: {
          ballotStyleGroupId: '1' as BallotStyleGroupId,
          batchId: 'b1',
          precinctId: '23',
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
    store.addBallotImage({
      cvrId,
      electionDefinitionId: 'election-general',
      imageData: Buffer.from('image-data'),
      side: 'front',
    });

    const mountPoint = makeTemporaryDirectory();

    const ctx: Parameters<typeof performBackup>[0] = {
      workspacePath,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      machineId: 'VX-001',
      softwareVersion: 'dev',
      logger,
      backupDatabase,
    };

    // First backup
    (await performBackup(ctx)).unsafeUnwrap();

    // Second backup (image should be hard-linked from previous)
    (await performBackup(ctx)).unsafeUnwrap();

    const [backupEntry] = await listBackups(mountPoint);
    const backupDir = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      assertDefined(backupEntry).directoryName
    );
    const manifest = (await validateBackup(backupDir)).unsafeUnwrap();
    expect(manifest.files.length).toEqual(2); // db + 1 image
  });

  test('reports progress', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();
    const mountPoint = makeTemporaryDirectory();
    const phases = new Set<string>();

    (
      await performBackup({
        workspacePath,
        dbPath,
        ballotImagesPath,
        backupDriveMountPoint: mountPoint,
        machineId: 'VX-001',
        softwareVersion: 'dev',
        logger,
        backupDatabase,
        onProgress: (progress) => {
          phases.add(progress.phase);
        },
      })
    ).unsafeUnwrap();

    expect(phases).toContain('preflight');
    expect(phases).toContain('snapshot');
    expect(phases).toContain('signing');
    expect(phases).toContain('validating');
  });
});
