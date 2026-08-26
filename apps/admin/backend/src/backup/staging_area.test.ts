import { expect, test, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { tryLockFileExclusive } from '@votingworks/fs';
import { BackupStagingArea } from './staging_area.js';
import { WorkspaceLayout } from '../util/workspace_layout.js';

vi.mock(
  import('node:fs/promises'),
  async (importActual): Promise<typeof import('node:fs/promises')> => {
    const actual = await importActual();
    return { ...actual, rm: vi.fn(actual.rm) as unknown as typeof rm };
  }
);

function makeLayout(): WorkspaceLayout {
  return new WorkspaceLayout(makeTemporaryDirectory());
}

function makeStaleStagingArea(layout: WorkspaceLayout): string {
  const stagingAreaPath = layout.backupStagingPath;
  mkdirSync(join(stagingAreaPath, 'copy-root'), { recursive: true });
  writeFileSync(join(stagingAreaPath, 'copy-root', 'data.db'), 'stale');
  return stagingAreaPath;
}

test('a workspace stages where its layout says, outside its content', async () => {
  const layout = makeLayout();
  const stagingArea = (
    await BackupStagingArea.inWorkspace(layout)
  ).unsafeUnwrap();

  // Staging outside the content directory is what lets a restore exchange
  // that directory without taking a running backup's files with it.
  expect(existsSync(layout.backupStagingPath)).toEqual(true);
  expect(existsSync(layout.backupStagingLockPath)).toEqual(true);
  expect(
    relative(layout.contentPath, layout.backupStagingPath).startsWith('..')
  ).toEqual(true);

  await stagingArea.cleanup();
});

test('staged files are named by where they sit in the content directory', async () => {
  const layout = makeLayout();
  mkdirSync(join(layout.ballotImagesPath, 'election-1'), { recursive: true });
  const imagePath = join(layout.ballotImagesPath, 'election-1', 'cvr-1-front');
  writeFileSync(imagePath, 'image');

  const stagingArea = (
    await BackupStagingArea.inWorkspace(layout)
  ).unsafeUnwrap();
  await stagingArea.linkWorkspaceFile(imagePath);

  // How the file is named in a backup, and so where a restore puts it back:
  // relative to the content directory, not to the workspace root. Otherwise
  // moving the content down a level would silently change the backup format.
  expect(
    stagingArea.listStagedFiles().map((file) => file.relativePath)
  ).toEqual([join('ballot-images', 'election-1', 'cvr-1-front')]);

  await stagingArea.cleanup();
});

test('a file outside the content directory cannot be staged', async () => {
  const layout = makeLayout();
  const strayPath = join(layout.root, 'stray');
  writeFileSync(strayPath, 'stray');

  const stagingArea = (
    await BackupStagingArea.inWorkspace(layout)
  ).unsafeUnwrap();

  // The staging area and its lock are themselves in the root, so a path
  // relative to the root rather than to the content directory would quietly
  // sweep them into the backup.
  await expect(stagingArea.linkWorkspaceFile(strayPath)).rejects.toThrow(
    `${strayPath} is not within ${layout.contentPath}`
  );

  await stagingArea.cleanup();
});

test('inWorkspace reclaims before staging, rather than accumulating', async () => {
  const layout = makeLayout();
  const stagingAreaPath = makeStaleStagingArea(layout);

  const stagingArea = (
    await BackupStagingArea.inWorkspace(layout)
  ).unsafeUnwrap();

  expect(stagingArea.fileCount).toEqual(0);
  expect(existsSync(join(stagingAreaPath, 'copy-root', 'data.db'))).toEqual(
    false
  );
  expect(existsSync(stagingAreaPath)).toEqual(true);

  await stagingArea.cleanup();
});

test('cleanup removes the staging area and lets the next run in', async () => {
  const layout = makeLayout();
  const stagingArea = (
    await BackupStagingArea.inWorkspace(layout)
  ).unsafeUnwrap();

  await stagingArea.cleanup();

  expect(existsSync(layout.backupStagingPath)).toEqual(false);
  // `unsafeUnwrap` is the assertion: the lock was released, so this succeeds.
  const next = await BackupStagingArea.inWorkspace(layout);
  await next.unsafeUnwrap().cleanup();
});

test('a second run is refused while the first holds the workspace', async () => {
  const layout = makeLayout();
  const first = (await BackupStagingArea.inWorkspace(layout)).unsafeUnwrap();

  // Without the lock this would delete the staged files out from under the
  // first run, since they share one fixed path.
  expect(
    (await BackupStagingArea.inWorkspace(layout)).unsafeUnwrapErr()
  ).toEqual({
    type: 'staging-area-busy',
    message: 'Another backup of this workspace is already running',
  });

  await first.cleanup();
});

test('a lock that fails for any other reason is not reported as busy', async () => {
  // A workspace directory that isn't there can't be locked, and that is not
  // something a caller can resolve by waiting.
  const missingLayout = new WorkspaceLayout(
    join(makeTemporaryDirectory(), 'not-there')
  );

  await expect(BackupStagingArea.inWorkspace(missingLayout)).rejects.toThrow(
    'ENOENT'
  );
});

test('a staging area that cannot be created releases its lock', async () => {
  const layout = makeLayout();
  const error: NodeJS.ErrnoException = new Error('input/output error');
  error.code = 'EIO';
  vi.mocked(rm).mockRejectedValueOnce(error);

  await expect(BackupStagingArea.inWorkspace(layout)).rejects.toThrow(
    'input/output error'
  );

  // A lock kept here would block every later backup for the life of the
  // process.
  const lock = await tryLockFileExclusive(layout.backupStagingLockPath);
  await lock.unsafeUnwrap().release();
});
