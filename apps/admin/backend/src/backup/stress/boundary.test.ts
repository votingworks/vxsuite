import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { err } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';

import { Store } from '../../store';
import {
  createWorkspace,
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../../util/workspace';
import { performBackup, listBackups, validateBackup } from '../backup';
import { performRestore, RestoreContext } from '../restore';
import { BACKUP_ROOT_DIR } from '../types';
import {
  backupAndValidate,
  collectFiles,
  createBackupContext,
  createPopulatedWorkspace,
  restoreToNewWorkspace,
} from './workspace_factory';

describe('boundary conditions', () => {
  test('backup fails gracefully with no election configured', async () => {
    const workspacePath = makeTemporaryDirectory();
    const logger = mockBaseLogger({ fn: vi.fn });
    const workspace = createWorkspace(workspacePath, logger);
    const mountPoint = makeTemporaryDirectory();

    const result = await performBackup({
      workspacePath,
      dbPath: workspace.dbPath,
      ballotImagesPath: workspace.ballotImagesPath,
      backupDriveMountPoint: mountPoint,
      machineId: 'BOUNDARY-TEST',
      softwareVersion: 'dev',
      logger,
      backupDatabase: (destPath: string) => {
        workspace.store.backup(destPath);
      },
    });

    expect(result).toEqual(err({ type: 'noElectionConfigured' }));
  });

  test('backup succeeds with election but zero CVRs and zero images', async () => {
    const workspace = createPopulatedWorkspace({ batchCount: 0 });
    const mountPoint = makeTemporaryDirectory();

    const { manifest } = await backupAndValidate(workspace, mountPoint);

    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0]!.path).toEqual('data.db');
  });

  test('backup succeeds with CVRs but zero ballot images', async () => {
    const workspace = createPopulatedWorkspace({
      cvrsPerBatch: 5,
      imagesPerCvr: 0,
    });
    const mountPoint = makeTemporaryDirectory();

    const { manifest } = await backupAndValidate(workspace, mountPoint);

    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0]!.path).toEqual('data.db');
    expect(workspace.totalImages).toEqual(0);
  });

  test('full round-trip: backup -> restore -> re-backup -> restore preserves data', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 2,
      cvrsPerBatch: 5,
      imagesPerCvr: 1,
    });
    expect(workspace.totalImages).toEqual(10);

    // Backup to drive A
    const driveA = makeTemporaryDirectory();
    const { backupDirName: dirNameA } = await backupAndValidate(
      workspace,
      driveA
    );

    // Restore to new workspace
    const restoredPath1 = await restoreToNewWorkspace(
      driveA,
      dirNameA,
      workspace.logger
    );

    // Open the restored database without schema re-initialization
    const logger2 = mockBaseLogger({ fn: vi.fn });
    const restoredDbPath1 = join(restoredPath1, WORKSPACE_DB_FILENAME);
    const restoredImagesPath1 = join(
      restoredPath1,
      WORKSPACE_BALLOT_IMAGES_DIR
    );
    const restoredStore1 = Store.snapshotStore(
      restoredDbPath1,
      restoredImagesPath1,
      logger2
    );
    const driveB = makeTemporaryDirectory();

    const ctx2 = createBackupContext(
      {
        workspacePath: restoredPath1,
        dbPath: restoredDbPath1,
        ballotImagesPath: restoredImagesPath1,
        logger: logger2,
        store: restoredStore1,
        electionId: '',
        backupDatabase: (destPath: string) => {
          restoredStore1.backup(destPath);
        },
        totalImages: 10,
        cvrIds: [],
      },
      driveB
    );
    (await performBackup(ctx2)).unsafeUnwrap();

    const entriesB = await listBackups(driveB);
    expect(entriesB).toHaveLength(1);
    const backupDirB = join(
      driveB,
      BACKUP_ROOT_DIR,
      entriesB[0]!.directoryName
    );
    (await validateBackup(backupDirB)).unsafeUnwrap();

    // Restore from drive B to a third workspace
    const restoredPath2 = await restoreToNewWorkspace(
      driveB,
      entriesB[0]!.directoryName,
      logger2
    );

    // Verify all images byte-for-byte identical between original and final
    const originalImages = await collectFiles(workspace.ballotImagesPath);
    const finalImages = await collectFiles(
      join(restoredPath2, WORKSPACE_BALLOT_IMAGES_DIR)
    );

    expect(finalImages.size).toEqual(originalImages.size);
    for (const [path, originalContent] of originalImages) {
      const finalContent = finalImages.get(path);
      expect(finalContent).toBeDefined();
      expect(originalContent.equals(finalContent!)).toEqual(true);
    }
  });

  test('sequential backups to the same drive replace the previous backup', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 2,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    // First backup
    await backupAndValidate(workspace, mountPoint);
    const entriesAfterFirst = await listBackups(mountPoint);
    expect(entriesAfterFirst).toHaveLength(1);

    // Second backup to same drive (same election, so same directory name)
    await backupAndValidate(workspace, mountPoint);
    const entriesAfterSecond = await listBackups(mountPoint);
    expect(entriesAfterSecond).toHaveLength(1);

    // Both the first and second used the same directory name
    expect(entriesAfterSecond[0]!.directoryName).toEqual(
      entriesAfterFirst[0]!.directoryName
    );

    // The backup is still valid
    const backupDir = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      entriesAfterSecond[0]!.directoryName
    );
    const manifest = (await validateBackup(backupDir)).unsafeUnwrap();
    expect(manifest.files.length).toBeGreaterThanOrEqual(1);
  });

  test('restore from backup with no images creates empty ballot-images directory', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 0,
    });
    expect(workspace.totalImages).toEqual(0);

    const mountPoint = makeTemporaryDirectory();
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);

    // Restore to a fresh workspace
    const newWorkspacePath = makeTemporaryDirectory();
    const newBallotImagesPath = join(
      newWorkspacePath,
      WORKSPACE_BALLOT_IMAGES_DIR
    );
    const logger = mockBaseLogger({ fn: vi.fn });

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

    // Verify ballot-images directory exists but is empty
    const imagesDirStat = await stat(newBallotImagesPath);
    expect(imagesDirStat.isDirectory()).toEqual(true);

    const imagesDirContents = await readdir(newBallotImagesPath);
    expect(imagesDirContents).toHaveLength(0);

    // Verify data.db exists
    const dbStat = await stat(join(newWorkspacePath, WORKSPACE_DB_FILENAME));
    expect(dbStat.isFile()).toEqual(true);
  });
});
