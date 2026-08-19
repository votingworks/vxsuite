import { expect, test, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { BackupRoot } from './backup_root.js';

vi.mock(
  import('node:fs/promises'),
  async (importActual): Promise<typeof import('node:fs/promises')> => {
    const actual = await importActual();
    return {
      ...actual,
      readdir: vi.fn(actual.readdir) as unknown as typeof readdir,
    };
  }
);

test('exposes the root path', () => {
  expect(new BackupRoot('/media/vx/backup').path).toEqual('/media/vx/backup');
});

test('lists backup directories, ignoring stray files', async () => {
  const rootPath = makeTemporaryDirectory();
  const backupsPath = join(rootPath, 'vxadmin-backups');
  mkdirSync(join(backupsPath, 'backup-1'), { recursive: true });
  mkdirSync(join(backupsPath, 'backup-2'), { recursive: true });
  writeFileSync(join(backupsPath, 'stray-file.txt'), 'not a backup');

  const backups = (await new BackupRoot(rootPath).listBackups()).unsafeUnwrap();
  expect(backups.map((backup) => backup.path).sort()).toEqual([
    join(backupsPath, 'backup-1'),
    join(backupsPath, 'backup-2'),
  ]);
});

test('lists no backups when the backups directory is empty', async () => {
  const rootPath = makeTemporaryDirectory();
  mkdirSync(join(rootPath, 'vxadmin-backups'));

  expect((await new BackupRoot(rootPath).listBackups()).unsafeUnwrap()).toEqual(
    []
  );
});

test('lists no backups when the backups directory does not exist', async () => {
  const rootPath = makeTemporaryDirectory();

  expect((await new BackupRoot(rootPath).listBackups()).unsafeUnwrap()).toEqual(
    []
  );
});

test('returns an error when the root does not exist', async () => {
  const rootPath = join(makeTemporaryDirectory(), 'does-not-exist');

  const result = await new BackupRoot(rootPath).listBackups();
  expect(result.unsafeUnwrapErr()).toEqual({
    type: 'root-not-found',
    message: `${rootPath} does not exist`,
  });
});

test('returns an error when the root is not a directory', async () => {
  const rootPath = join(makeTemporaryDirectory(), 'file.txt');
  writeFileSync(rootPath, 'not a directory');

  const result = await new BackupRoot(rootPath).listBackups();
  expect(result.unsafeUnwrapErr()).toEqual({
    type: 'not-directory',
    message: `${rootPath} is not a directory`,
  });
});

test('returns an error when the backups directory is not a directory', async () => {
  const rootPath = makeTemporaryDirectory();
  const backupsPath = join(rootPath, 'vxadmin-backups');
  writeFileSync(backupsPath, 'not a directory');

  const result = await new BackupRoot(rootPath).listBackups();
  expect(result.unsafeUnwrapErr()).toEqual({
    type: 'not-directory',
    message: `${backupsPath} is not a directory`,
  });
});

test('fails fast on unexpected errors', async () => {
  const rootPath = makeTemporaryDirectory();
  mkdirSync(join(rootPath, 'vxadmin-backups'));

  const error = new Error('permission denied') as NodeJS.ErrnoException;
  error.code = 'EACCES';
  vi.mocked(readdir).mockRejectedValueOnce(error);

  await expect(new BackupRoot(rootPath).listBackups()).rejects.toThrow(
    'permission denied'
  );
});
