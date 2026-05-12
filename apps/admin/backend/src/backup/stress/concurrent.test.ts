import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { describe, expect, test } from 'vitest';

import { listBackups, performBackup, validateBackup } from '../backup';
import {
  BACKUP_ROOT_DIR,
  IN_PROGRESS_SUFFIX,
  PREVIOUS_SUFFIX,
} from '../types';
import {
  createBackupContext,
  createPopulatedWorkspace,
} from './workspace_factory';

describe('concurrent operations', () => {
  test(
    'two simultaneous backups to the same drive do not corrupt data',
    { timeout: 60_000 },
    async () => {
      const workspace = createPopulatedWorkspace({
        batchCount: 4,
        cvrsPerBatch: 5,
        imagesPerCvr: 1,
      });
      expect(workspace.totalImages).toEqual(20);

      const mountPoint = makeTemporaryDirectory();

      const ctx1 = createBackupContext(workspace, mountPoint);
      const ctx2 = createBackupContext(workspace, mountPoint);

      await Promise.allSettled([
        performBackup(ctx1),
        performBackup(ctx2),
      ]);

      // Both may fail due to file system races — the key invariant is that
      // no data corruption occurs and a follow-up backup succeeds cleanly.
      (
        await performBackup(createBackupContext(workspace, mountPoint))
      ).unsafeUnwrap();

      const entries = await listBackups(mountPoint);
      expect(entries).toHaveLength(1);

      const backupDir = join(
        mountPoint,
        BACKUP_ROOT_DIR,
        assertDefined(entries[0]).directoryName
      );
      (await validateBackup(backupDir)).unsafeUnwrap();

      // No stale in-progress or previous directories remain
      const rootEntries = await readdir(join(mountPoint, BACKUP_ROOT_DIR));
      for (const entry of rootEntries) {
        expect(entry).not.toMatch(new RegExp(`${IN_PROGRESS_SUFFIX}$`));
        expect(entry).not.toMatch(new RegExp(`${PREVIOUS_SUFFIX}$`));
      }
    }
  );

  test(
    'rapid sequential backups produce valid results',
    { timeout: 60_000 },
    async () => {
      const workspace = createPopulatedWorkspace({
        batchCount: 2,
        cvrsPerBatch: 5,
        imagesPerCvr: 1,
      });
      expect(workspace.totalImages).toEqual(10);

      const mountPoint = makeTemporaryDirectory();
      const ctx = createBackupContext(workspace, mountPoint);

      for (let i = 0; i < 5; i += 1) {
        (await performBackup(ctx)).unsafeUnwrap();
      }

      const entries = await listBackups(mountPoint);
      expect(entries).toHaveLength(1);

      const backupDir = join(
        mountPoint,
        BACKUP_ROOT_DIR,
        assertDefined(entries[0]).directoryName
      );
      (await validateBackup(backupDir)).unsafeUnwrap();
    }
  );
});
