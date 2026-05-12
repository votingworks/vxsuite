import { execFile } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';

import { listBackups, performBackup, validateBackup } from '../backup';
import { performRestore } from '../restore';
import {
  BACKUP_ROOT_DIR,
  IN_PROGRESS_SUFFIX,
  RESTORE_IN_PROGRESS_DIR,
} from '../types';
import {
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../../util/workspace';
import {
  createBackupContext,
  createPopulatedWorkspace,
} from './workspace_factory';

const BIN_PATH = join(__dirname, '../../../bin/backup');

async function waitForPath(targetPath: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await stat(targetPath);
      return;
    } catch {
      await sleep(50);
    }
  }
  throw new Error(`Timed out waiting for ${targetPath}`);
}

async function findInProgressDir(
  backupRootPath: string,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const entries = await readdir(backupRootPath);
      const inProgress = entries.find((e) => e.endsWith(IN_PROGRESS_SUFFIX));
      if (inProgress) {
        return join(backupRootPath, inProgress);
      }
    } catch {
      // Directory may not exist yet
    }
    await sleep(50);
  }
  throw new Error(
    `Timed out waiting for in-progress directory in ${backupRootPath}`
  );
}

describe('process kill and resume', () => {
  test(
    'recovers from SIGKILL during backup',
    { timeout: 60_000 },
    async () => {
      const workspace = createPopulatedWorkspace({
        batchCount: 10,
        cvrsPerBatch: 10,
        imagesPerCvr: 1,
        imageSizeRange: [10_000, 50_000],
      });
      expect(workspace.totalImages).toEqual(100);

      const mountPoint = makeTemporaryDirectory();
      const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);

      const childExited = new Promise<void>((resolve) => {
        const child = execFile(
          'node',
          [
            BIN_PATH,
            'backup',
            '--workspace',
            workspace.workspacePath,
            '--mount-point',
            mountPoint,
          ],
          {
            env: {
              ...process.env,
              VX_MACHINE_ID: 'test',
              VX_CODE_VERSION: 'dev',
            },
          },
          () => {
            resolve();
          }
        );

        void findInProgressDir(backupRootPath, 15_000).then(() => {
          child.kill('SIGKILL');
        });
      });

      await childExited;

      const entriesAfterKill = await readdir(backupRootPath);
      const hasInProgress = entriesAfterKill.some((e) =>
        e.endsWith(IN_PROGRESS_SUFFIX)
      );
      expect(hasInProgress).toEqual(true);

      const ctx = createBackupContext(workspace, mountPoint);
      const result = await performBackup(ctx);
      result.unsafeUnwrap();

      const entries = await listBackups(mountPoint);
      expect(entries).toHaveLength(1);

      const backupDir = join(
        mountPoint,
        BACKUP_ROOT_DIR,
        entries[0]!.directoryName
      );
      (await validateBackup(backupDir)).unsafeUnwrap();

      const finalEntries = await readdir(backupRootPath);
      for (const entry of finalEntries) {
        expect(entry).not.toMatch(new RegExp(`${IN_PROGRESS_SUFFIX}$`));
      }
    }
  );

  test(
    'recovers from SIGKILL during restore',
    { timeout: 60_000 },
    async () => {
      const workspace = createPopulatedWorkspace({
        batchCount: 10,
        cvrsPerBatch: 10,
        imagesPerCvr: 1,
        imageSizeRange: [10_000, 50_000],
      });

      const mountPoint = makeTemporaryDirectory();

      const ctx = createBackupContext(workspace, mountPoint);
      (await performBackup(ctx)).unsafeUnwrap();

      const entries = await listBackups(mountPoint);
      expect(entries).toHaveLength(1);
      const backupDirName = entries[0]!.directoryName;

      const restoreWorkspace = makeTemporaryDirectory();
      await mkdir(join(restoreWorkspace, WORKSPACE_BALLOT_IMAGES_DIR), {
        recursive: true,
      });

      const restoreInProgressPath = join(
        restoreWorkspace,
        RESTORE_IN_PROGRESS_DIR
      );

      const childExited = new Promise<void>((resolve) => {
        const child = execFile(
          'node',
          [
            BIN_PATH,
            'restore',
            '--workspace',
            restoreWorkspace,
            '--mount-point',
            mountPoint,
          ],
          {
            env: {
              ...process.env,
              VX_MACHINE_ID: 'test',
              VX_CODE_VERSION: 'dev',
            },
          },
          () => {
            resolve();
          }
        );

        void waitForPath(restoreInProgressPath, 15_000).then(() => {
          child.kill('SIGKILL');
        });
      });

      await childExited;

      const restoreResult = await performRestore({
        workspacePath: restoreWorkspace,
        dbPath: join(restoreWorkspace, WORKSPACE_DB_FILENAME),
        ballotImagesPath: join(restoreWorkspace, WORKSPACE_BALLOT_IMAGES_DIR),
        backupDriveMountPoint: mountPoint,
        backupDirectoryName: backupDirName,
        softwareVersion: 'dev',
        logger: workspace.logger,
      });

      restoreResult.unsafeUnwrap();
    }
  );
});
