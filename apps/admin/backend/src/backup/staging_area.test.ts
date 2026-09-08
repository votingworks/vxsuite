import { expect, test, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { tryLockFileExclusive } from '@votingworks/fs';
import { BackupStagingArea } from './staging_area.js';

vi.mock(
  import('node:fs/promises'),
  async (importActual): Promise<typeof import('node:fs/promises')> => {
    const actual = await importActual();
    return { ...actual, rm: vi.fn(actual.rm) as unknown as typeof rm };
  }
);

function makeStaleStagingArea(workspacePath: string): string {
  const stagingAreaPath = BackupStagingArea.pathIn(workspacePath);
  mkdirSync(join(stagingAreaPath, 'copy-root'), { recursive: true });
  writeFileSync(join(stagingAreaPath, 'copy-root', 'data.db'), 'stale');
  return stagingAreaPath;
}

test('a workspace stages at one fixed path', () => {
  const workspacePath = makeTemporaryDirectory();

  // Fixed, so that what a killed run left behind is at a path the next run
  // knows to look at.
  expect(BackupStagingArea.pathIn(workspacePath)).toEqual(
    join(workspacePath, 'backup-staging')
  );
  expect(BackupStagingArea.lockPathIn(workspacePath)).toEqual(
    join(workspacePath, 'backup-staging.lock')
  );
});

test('inWorkspace reclaims before staging, rather than accumulating', async () => {
  const workspacePath = makeTemporaryDirectory();
  const stagingAreaPath = makeStaleStagingArea(workspacePath);

  const stagingArea = (
    await BackupStagingArea.inWorkspace(workspacePath)
  ).unsafeUnwrap();

  expect(stagingArea.fileCount).toEqual(0);
  expect(existsSync(join(stagingAreaPath, 'copy-root', 'data.db'))).toEqual(
    false
  );
  expect(existsSync(stagingAreaPath)).toEqual(true);

  await stagingArea.cleanup();
});

test('cleanup removes the staging area and lets the next run in', async () => {
  const workspacePath = makeTemporaryDirectory();
  const stagingArea = (
    await BackupStagingArea.inWorkspace(workspacePath)
  ).unsafeUnwrap();

  await stagingArea.cleanup();

  expect(existsSync(BackupStagingArea.pathIn(workspacePath))).toEqual(false);
  // `unsafeUnwrap` is the assertion: the lock was released, so this succeeds.
  const next = await BackupStagingArea.inWorkspace(workspacePath);
  await next.unsafeUnwrap().cleanup();
});

test('a second run is refused while the first holds the workspace', async () => {
  const workspacePath = makeTemporaryDirectory();
  const first = (
    await BackupStagingArea.inWorkspace(workspacePath)
  ).unsafeUnwrap();

  // Without the lock this would delete the staged files out from under the
  // first run, since they share one fixed path.
  expect(
    (await BackupStagingArea.inWorkspace(workspacePath)).unsafeUnwrapErr()
  ).toEqual({
    type: 'staging-area-busy',
    message: 'Another backup of this workspace is already running',
  });

  await first.cleanup();
});

test('a lock that fails for any other reason is not reported as busy', async () => {
  // A workspace directory that isn't there can't be locked, and that is not
  // something a caller can resolve by waiting.
  const missingWorkspacePath = join(makeTemporaryDirectory(), 'not-there');

  await expect(
    BackupStagingArea.inWorkspace(missingWorkspacePath)
  ).rejects.toThrow('ENOENT');
});

test('a staging area that cannot be cleaned up releases its lock', async () => {
  const workspacePath = makeTemporaryDirectory();
  const stagingArea = (
    await BackupStagingArea.inWorkspace(workspacePath)
  ).unsafeUnwrap();
  const error: NodeJS.ErrnoException = new Error('input/output error');
  error.code = 'EIO';
  vi.mocked(rm).mockRejectedValueOnce(error);

  await expect(stagingArea.cleanup()).rejects.toThrow('input/output error');

  const lock = await tryLockFileExclusive(
    BackupStagingArea.lockPathIn(workspacePath)
  );
  await lock.unsafeUnwrap().release();
});

test('a staging area that cannot be created releases its lock', async () => {
  const workspacePath = makeTemporaryDirectory();
  const error: NodeJS.ErrnoException = new Error('input/output error');
  error.code = 'EIO';
  vi.mocked(rm).mockRejectedValueOnce(error);

  await expect(BackupStagingArea.inWorkspace(workspacePath)).rejects.toThrow(
    'input/output error'
  );

  // A lock kept here would block every later backup for the life of the
  // process.
  const lock = await tryLockFileExclusive(
    BackupStagingArea.lockPathIn(workspacePath)
  );
  await lock.unsafeUnwrap().release();
});
