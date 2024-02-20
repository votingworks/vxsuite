import { iter } from '@votingworks/basics';
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

    const listDirectoryResult = await listDirectory(directory.name);
    expect(listDirectoryResult.isOk()).toBeTruthy();

    expect(listDirectoryResult.ok()).toMatchObject([
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

  test('throws error on relative path', async () => {
    await expect(listDirectory('./relative')).rejects.toThrow();
  });

  test('returns error on non-existent file', async () => {
    const listDirectoryResult = await listDirectory('/tmp/no-entity');
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({ type: 'no-entity' });
  });

  test('returns error on non-directory', async () => {
    const file = tmp.fileSync();
    const listDirectoryResult = await listDirectory(file.name);
    expect(listDirectoryResult.isErr()).toBeTruthy();
    expect(listDirectoryResult.err()).toMatchObject({ type: 'not-directory' });
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

    const fileEntries = iter(listDirectoryRecursive(directory.name)).map(
      (result) => result.ok()
    );

    expect(await fileEntries.toArray()).toMatchObject([
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

  test('bubbles up root errors', () => {
    const results = iter(listDirectoryRecursive('/tmp/no-entity'));
    expect(results.some((result) => result.isErr())).toBeTruthy();
  });
});
