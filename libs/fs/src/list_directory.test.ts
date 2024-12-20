import { describe, expect, test } from 'vitest';
import { err, iter, ok } from '@votingworks/basics';
import { symlinkSync } from 'node:fs';
import tmp from 'tmp';
import {
  FileSystemEntryType,
  listDirectory,
  listDirectoryRecursive,
} from './list_directory';

describe(listDirectory, () => {
  test('happy path', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });

    const results = await iter(listDirectory(directory.name)).toArray();

    expect(results).toMatchObject([
      ok(
        expect.objectContaining({
          name: 'file-1',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'file-2',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'subdirectory',
          type: FileSystemEntryType.Directory,
        })
      ),
    ]);
  });

  test('ignores symlinks', async () => {
    const directory = tmp.dirSync();
    const file = tmp.fileSync({ name: 'file-1', dir: directory.name });
    symlinkSync(file.name, `${directory.name}/symlink`);

    const results = await iter(listDirectory(directory.name)).toArray();

    expect(results).toMatchObject([
      ok(
        expect.objectContaining({
          name: 'file-1',
          type: FileSystemEntryType.File,
        })
      ),
    ]);
  });

  test('throws error on relative path', async () => {
    await expect(listDirectory('./relative').next()).rejects.toThrow();
  });

  test('returns error on non-existent file', async () => {
    expect(await iter(listDirectory('/tmp/no-entity')).toArray()).toMatchObject(
      [err({ type: 'no-entity' })]
    );
  });

  test('returns error on non-directory', async () => {
    const file = tmp.fileSync();
    expect(await iter(listDirectory(file.name)).toArray()).toMatchObject([
      err({ type: 'not-directory' }),
    ]);
  });
});

describe(listDirectoryRecursive, () => {
  test('happy path', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    const subDirectory = tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });
    tmp.fileSync({ name: 'sub-file-2', dir: subDirectory.name });

    const results = iter(listDirectoryRecursive(directory.name));

    expect(await results.toArray()).toMatchObject([
      ok(
        expect.objectContaining({
          name: 'file-1',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'file-2',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'sub-file-2',
          type: FileSystemEntryType.File,
        })
      ),
      ok(
        expect.objectContaining({
          name: 'subdirectory',
          type: FileSystemEntryType.Directory,
        })
      ),
    ]);
  });

  test('bubbles up root errors', async () => {
    const results = iter(listDirectoryRecursive('/tmp/no-entity'));
    expect(await results.some((result) => result.isErr())).toBeTruthy();
  });
});
