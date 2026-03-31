import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, test, vi } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import {
  electionGeneralFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';

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
    const client = DbClient.fileClient(dbPath, logger);
    client.backup(destPath);
  }

  return { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase };
}

function createManifest(
  backupDir: string,
  overrides: Partial<BackupManifest> = {}
): BackupManifest {
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(join(backupDir, BACKUP_IMAGES_DIR), { recursive: true });

  const dbContent = 'db-content';
  writeFileSync(join(backupDir, BACKUP_DB_FILENAME), dbContent);

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
  writeFileSync(join(backupDir, MANIFEST_FILENAME), manifestJson);
  writeFileSync(
    join(backupDir, MANIFEST_SIGNATURE_FILENAME),
    signManifest(manifestJson)
  );

  return manifest;
}

describe('validateBackup', () => {
  test('rejects software version mismatch', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    createManifest(backupDir, { softwareVersion: '1.0.0' });

    await expect(validateBackup(backupDir, '2.0.0')).rejects.toThrow(
      'Backup was created with software version 1.0.0'
    );
  });

  test('allows dev version bypass', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    createManifest(backupDir, { softwareVersion: 'dev' });

    const manifest = await validateBackup(backupDir, '2.0.0');
    expect(manifest.softwareVersion).toEqual('dev');
  });

  test('allows when current version is dev', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    createManifest(backupDir, { softwareVersion: '1.0.0' });

    const manifest = await validateBackup(backupDir, 'dev');
    expect(manifest.softwareVersion).toEqual('1.0.0');
  });

  test('rejects missing manifest', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    mkdirSync(backupDir, { recursive: true });

    await expect(validateBackup(backupDir)).rejects.toThrow('ENOENT');
  });

  test('rejects missing signature', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, MANIFEST_FILENAME), '{}');

    await expect(validateBackup(backupDir)).rejects.toThrow('ENOENT');
  });

  test('rejects tampered file hash', async () => {
    const tmpDir = makeTemporaryDirectory();
    const backupDir = join(tmpDir, 'backup');
    createManifest(backupDir);

    writeFileSync(join(backupDir, BACKUP_DB_FILENAME), 'tampered');

    await expect(validateBackup(backupDir)).rejects.toThrow('Hash mismatch');
  });
});

describe('listBackups', () => {
  test('returns empty for non-existent root', () => {
    expect(listBackups('/nonexistent')).toEqual([]);
  });

  test('skips in-progress and previous directories', () => {
    const tmpDir = makeTemporaryDirectory();
    const backupRoot = join(tmpDir, BACKUP_ROOT_DIR);

    const inProgress = join(backupRoot, 'election-in-progress');
    mkdirSync(inProgress, { recursive: true });
    writeFileSync(join(inProgress, MANIFEST_FILENAME), '{}');

    const previous = join(backupRoot, 'election-previous');
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, MANIFEST_FILENAME), '{}');

    createManifest(join(backupRoot, 'election-good'));

    const backups = listBackups(tmpDir);
    expect(backups.length).toEqual(1);
    expect(assertDefined(backups[0]).directoryName).toEqual('election-good');
  });

  test('skips directories without manifests', () => {
    const tmpDir = makeTemporaryDirectory();
    const backupRoot = join(tmpDir, BACKUP_ROOT_DIR);
    mkdirSync(join(backupRoot, 'empty-dir'), { recursive: true });

    expect(listBackups(tmpDir)).toEqual([]);
  });
});

describe('performBackup', () => {
  test('creates a valid backup', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();
    const mountPoint = makeTemporaryDirectory();

    await performBackup({
      workspacePath,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      electionId: 'e1',
      electionTitle: 'Test Election',
      electionDate: '2026-01-01',
      electionDirName: 'test-election',
      machineId: 'VX-001',
      softwareVersion: 'dev',
      logger,
      backupDatabase,
    });

    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, 'test-election');
    expect(existsSync(join(backupDir, MANIFEST_FILENAME))).toEqual(true);
    expect(existsSync(join(backupDir, BACKUP_DB_FILENAME))).toEqual(true);

    const manifest = await validateBackup(backupDir);
    expect(manifest.electionTitle).toEqual('Test Election');
  });

  test('handles cancellation during backup', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();
    const mountPoint = makeTemporaryDirectory();

    await expect(
      performBackup({
        workspacePath,
        dbPath,
        ballotImagesPath,
        backupDriveMountPoint: mountPoint,
        electionId: 'e1',
        electionTitle: 'Test',
        electionDate: '2026-01-01',
        electionDirName: 'test',
        machineId: 'VX-001',
        softwareVersion: 'dev',
        logger,
        backupDatabase,
        signal: AbortSignal.abort(),
      })
    ).rejects.toThrow('Backup was cancelled');

    expect(
      existsSync(join(mountPoint, BACKUP_ROOT_DIR, 'test-in-progress'))
    ).toEqual(false);
  });

  test('backup with images deduplicates from previous backup', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();

    // Add a ballot image to the database and filesystem
    const testLogger = mockBaseLogger({ fn: vi.fn });
    const client = DbClient.fileClient(dbPath, testLogger);
    const electionDefId = (
      client.one(
        `select election_data ->> 'id' as id from elections limit 1`
      ) as { id: string }
    ).id;
    const electionId = (
      client.one(`select id from elections limit 1`) as { id: string }
    ).id;
    client.run(
      `insert into scanner_batches (id, label, scanner_id, election_id, started_at) values ('b1', 'Batch 1', 'scanner-1', ?, datetime('now'))`,
      electionId
    );
    client.run(
      `insert into cvrs (id, election_id, ballot_id, ballot_style_group_id, ballot_type, batch_id, precinct_id, votes, is_blank, has_overvote, has_undervote, has_write_in) values ('cvr-1', ?, 'ballot-1', '1', 'precinct', 'b1', 'precinct-1', '{}', 0, 0, 0, 0)`,
      electionId
    );
    client.run(
      `insert into ballot_images (cvr_id, side) values ('cvr-1', 'front')`
    );
    const imagesDir = join(ballotImagesPath, electionDefId);
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(imagesDir, 'cvr-1-front'), 'image-data');

    const mountPoint = makeTemporaryDirectory();

    const ctx: Parameters<typeof performBackup>[0] = {
      workspacePath,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      electionId: 'e1',
      electionTitle: 'Test',
      electionDate: '2026-01-01',
      electionDirName: 'test',
      machineId: 'VX-001',
      softwareVersion: 'dev',
      logger,
      backupDatabase,
    };

    // First backup
    await performBackup(ctx);

    // Second backup (image should be hard-linked from previous)
    await performBackup(ctx);

    const backupDir = join(mountPoint, BACKUP_ROOT_DIR, 'test');
    const manifest = await validateBackup(backupDir);
    expect(manifest.files.length).toEqual(2); // db + 1 image
  });

  test('reports progress', async () => {
    const { workspacePath, dbPath, ballotImagesPath, logger, backupDatabase } =
      createTestWorkspace();
    const mountPoint = makeTemporaryDirectory();
    const phases = new Set<string>();

    await performBackup({
      workspacePath,
      dbPath,
      ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      electionId: 'e1',
      electionTitle: 'Test',
      electionDate: '2026-01-01',
      electionDirName: 'test',
      machineId: 'VX-001',
      softwareVersion: 'dev',
      logger,
      backupDatabase,
      onProgress: (progress) => {
        phases.add(progress.phase);
      },
    });

    expect(phases).toContain('preflight');
    expect(phases).toContain('snapshot');
    expect(phases).toContain('signing');
    expect(phases).toContain('validating');
  });
});
