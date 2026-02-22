import { describe, expect, test } from 'vitest';
import { err, iter, Result } from '@votingworks/basics';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { execFileSync } from 'node:child_process';
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

  test('includes hidden files and directories by default', async () => {
    const directory = makeTemporaryDirectory();

    // Create normal files and directories
    writeFileSync(join(directory, 'normal-file.txt'), '');
    const normalDirectory = join(directory, 'normal-directory');
    mkdirSync(normalDirectory, { recursive: true });

    // Create hidden files starting with . and _
    writeFileSync(join(directory, '.hidden-file'), '');
    const dotDirectory = join(directory, '.hidden-directory');
    mkdirSync(dotDirectory, { recursive: true });
    writeFileSync(join(directory, '_system-file'), '');
    const underscoreDirectory = join(directory, '_system-directory');
    mkdirSync(underscoreDirectory, { recursive: true });

    // Create files inside hidden directories to test depth > 0
    writeFileSync(join(dotDirectory, 'file-in-hidden-dir.txt'), '');
    writeFileSync(join(underscoreDirectory, 'file-in-system-dir.txt'), '');

    const results = await unwrapAndSortEntries(
      listDirectory(directory, { depth: 2 })
    );

    // Verify all files are included
    const resultNames = results.map((entry) => entry.name);
    expect(resultNames).toHaveLength(8);
    expect(resultNames).toContain('.hidden-file');
    expect(resultNames).toContain('.hidden-directory');
    expect(resultNames).toContain('_system-file');
    expect(resultNames).toContain('_system-directory');
    expect(resultNames).toContain('file-in-hidden-dir.txt');
    expect(resultNames).toContain('file-in-system-dir.txt');
  });

  test('excludes hidden files when excludeHidden is true', async () => {
    const directory = makeTemporaryDirectory();

    // Create normal files and directories
    writeFileSync(join(directory, 'normal-file.txt'), '');
    const normalDirectory = join(directory, 'normal-directory');
    mkdirSync(normalDirectory, { recursive: true });

    // Create hidden files starting with . and _
    writeFileSync(join(directory, '.hidden-file'), '');
    writeFileSync(join(directory, '_system-file'), '');
    const dotDirectory = join(directory, '.hidden-directory');
    mkdirSync(dotDirectory, { recursive: true });
    const underscoreDirectory = join(directory, '_system-directory');
    mkdirSync(underscoreDirectory, { recursive: true });

    // Create files inside hidden directories to test depth > 0
    writeFileSync(join(dotDirectory, 'file-in-hidden-dir.txt'), '');
    writeFileSync(join(underscoreDirectory, 'file-in-system-dir.txt'), '');

    const results = await unwrapAndSortEntries(
      listDirectory(directory, { excludeHidden: true, depth: 2 })
    );

    // Verify hidden files and files inside hidden directories are not included
    const resultNames = results.map((entry) => entry.name);
    expect(resultNames).toHaveLength(2);
    expect(resultNames).toContain('normal-directory');
    expect(resultNames).toContain('normal-file.txt');
  });

  test('closes the open directory properly', async () => {
    function lsof() {
      return execFileSync('lsof', ['-p', process.pid.toString()], {
        encoding: 'utf8',
      });
    }
    const directory = makeTemporaryDirectory();

    writeFileSync(join(directory, 'normal-file.txt'), '');
    writeFileSync(join(directory, 'another-file.txt'), '');

    const iterator = listDirectory(directory);
    await iterator.next();
    expect(lsof()).toContain(directory);
    await iterator.return(undefined);
    expect(lsof()).not.toContain(directory);
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
