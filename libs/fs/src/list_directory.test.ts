import { describe, expect, test } from 'vitest';
import { err, iter, Result } from '@votingworks/basics';
import { symlinkSync } from 'node:fs';
import tmp from 'tmp';
import {
  FileSystemEntry,
  FileSystemEntryType,
  listDirectory,
  ListDirectoryError,
  listDirectoryRecursive,
} from './list_directory';

async function unwrapAndSortEntries(
  generator: AsyncGenerator<Result<FileSystemEntry, ListDirectoryError>>
) {
  return (await iter(generator).toArray())
    .map((entry) => entry.unsafeUnwrap())
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('listDirectory', () => {
  test('happy path (default depth = 1)', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    const subdirectory = tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });
    tmp.fileSync({ name: 'sub-file-1', dir: subdirectory.name });

    const results = await unwrapAndSortEntries(listDirectory(directory.name));

    expect(results).toMatchObject([
      expect.objectContaining({
        name: 'file-1',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'file-2',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'subdirectory',
        type: FileSystemEntryType.Directory,
      }),
    ]);
  });

  test('happy path (depth > 1)', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    const subdirectory = tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });
    tmp.fileSync({ name: 'sub-file-1', dir: subdirectory.name });
    const subSubdirectory = tmp.dirSync({
      name: 'sub-subdirectory',
      dir: subdirectory.name,
    });
    tmp.fileSync({ name: 'sub-sub-file-1', dir: subSubdirectory.name });

    expect(
      await unwrapAndSortEntries(listDirectory(directory.name, 1))
    ).toMatchObject(
      ['file-1', 'file-2', 'subdirectory'].map((name) =>
        expect.objectContaining({ name })
      )
    );

    expect(
      await unwrapAndSortEntries(listDirectory(directory.name, 2))
    ).toMatchObject(
      [
        'file-1',
        'file-2',
        'sub-file-1',
        'sub-subdirectory',
        'subdirectory',
      ].map((name) => expect.objectContaining({ name }))
    );

    expect(
      await unwrapAndSortEntries(listDirectory(directory.name, 3))
    ).toMatchObject(
      [
        'file-1',
        'file-2',
        'sub-file-1',
        'sub-sub-file-1',
        'sub-subdirectory',
        'subdirectory',
      ].map((name) => expect.objectContaining({ name }))
    );

    expect(
      await unwrapAndSortEntries(listDirectory(directory.name, 4))
    ).toMatchObject(
      [
        'file-1',
        'file-2',
        'sub-file-1',
        'sub-sub-file-1',
        'sub-subdirectory',
        'subdirectory',
      ].map((name) => expect.objectContaining({ name }))
    );
  });

  test('ignores symlinks', async () => {
    const directory = tmp.dirSync();
    const file = tmp.fileSync({ name: 'file-1', dir: directory.name });
    symlinkSync(file.name, `${directory.name}/symlink`);

    const results = await unwrapAndSortEntries(listDirectory(directory.name));

    expect(results).toMatchObject([
      expect.objectContaining({
        name: 'file-1',
        type: FileSystemEntryType.File,
      }),
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

describe('listDirectoryRecursive', () => {
  test('happy path', async () => {
    const directory = tmp.dirSync();
    tmp.fileSync({ name: 'file-1', dir: directory.name });
    tmp.fileSync({ name: 'file-2', dir: directory.name });
    const subDirectory = tmp.dirSync({
      name: 'subdirectory',
      dir: directory.name,
    });
    tmp.fileSync({ name: 'sub-file-2', dir: subDirectory.name });

    expect(
      await unwrapAndSortEntries(listDirectoryRecursive(directory.name))
    ).toMatchObject([
      expect.objectContaining({
        name: 'file-1',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'file-2',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'sub-file-2',
        type: FileSystemEntryType.File,
      }),
      expect.objectContaining({
        name: 'subdirectory',
        type: FileSystemEntryType.Directory,
      }),
    ]);
  });

  test('bubbles up root errors', async () => {
    const results = iter(listDirectoryRecursive('/tmp/no-entity'));
    expect(await results.some((result) => result.isErr())).toBeTruthy();
  });
});
