import { describe, expect, test } from 'vitest';
import { err, iter, Result } from '@votingworks/basics';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
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
    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, 'file-1'), '');
    writeFileSync(join(directory, 'file-2'), '');

    const subdirectory = join(directory, 'subdirectory');
    mkdirSync(subdirectory, { recursive: true });
    writeFileSync(join(subdirectory, 'sub-file-1'), '');

    const results = await unwrapAndSortEntries(listDirectory(directory));

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
    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, 'file-1'), '');
    writeFileSync(join(directory, 'file-2'), '');

    const subdirectory = join(directory, 'subdirectory');
    mkdirSync(subdirectory, { recursive: true });
    writeFileSync(join(subdirectory, 'sub-file-1'), '');

    const subSubdirectory = join(subdirectory, 'sub-subdirectory');
    mkdirSync(subSubdirectory, { recursive: true });
    writeFileSync(join(subSubdirectory, 'sub-sub-file-1'), '');

    expect(
      await unwrapAndSortEntries(listDirectory(directory, { depth: 1 }))
    ).toMatchObject(
      ['file-1', 'file-2', 'subdirectory'].map((name) =>
        expect.objectContaining({ name })
      )
    );

    expect(
      await unwrapAndSortEntries(listDirectory(directory, { depth: 2 }))
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
      await unwrapAndSortEntries(listDirectory(directory, { depth: 3 }))
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
      await unwrapAndSortEntries(listDirectory(directory, { depth: 4 }))
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
    const directory = makeTemporaryDirectory();
    const file = join(directory, 'file-1');
    writeFileSync(file, '');
    symlinkSync(file, `${directory}/symlink`);

    const results = await unwrapAndSortEntries(listDirectory(directory));

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
    const file = makeTemporaryFile();
    expect(await iter(listDirectory(file)).toArray()).toMatchObject([
      err({ type: 'not-directory' }),
    ]);
  });
});

describe('listDirectoryRecursive', () => {
  test('happy path', async () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, 'file-1'), '');
    writeFileSync(join(directory, 'file-2'), '');
    const subDirectory = join(directory, 'subdirectory');
    mkdirSync(subDirectory, { recursive: true });
    writeFileSync(join(subDirectory, 'sub-file-2'), '');

    expect(
      await unwrapAndSortEntries(listDirectoryRecursive(directory))
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
