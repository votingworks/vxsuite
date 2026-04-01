import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';

import { cleanupSafe, formatBytes, getAvailableDiskSpace } from './fs_utils';

describe('getAvailableDiskSpace', () => {
  test('returns a positive number for a real directory', () => {
    const tmpDir = makeTemporaryDirectory();
    const space = getAvailableDiskSpace(tmpDir);
    expect(space).toBeGreaterThan(0);
  });

  test('returns 0 for a nonexistent path', () => {
    expect(getAvailableDiskSpace('/nonexistent/path/abc')).toEqual(0);
  });
});

describe('formatBytes', () => {
  test('formats bytes', () => {
    expect(formatBytes(500)).toEqual('500 bytes');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1_500)).toEqual('1.5 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(5_000_000)).toEqual('5.0 MB');
  });

  test('formats gigabytes', () => {
    expect(formatBytes(2_500_000_000)).toEqual('2.5 GB');
  });
});

describe('cleanupSafe', () => {
  test('removes a file', async () => {
    const tmpDir = makeTemporaryDirectory();
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'data');
    expect((await stat(filePath)).isFile()).toEqual(true);
    await cleanupSafe(filePath);
    await expect(stat(filePath)).rejects.toEqual(
      expect.objectContaining({ code: 'ENOENT' })
    );
  });

  test('removes a directory recursively', async () => {
    const tmpDir = makeTemporaryDirectory();
    const dirPath = join(tmpDir, 'subdir');
    await mkdir(dirPath, { recursive: true });
    await writeFile(join(dirPath, 'file.txt'), 'data');
    expect((await stat(dirPath)).isDirectory()).toEqual(true);
    await cleanupSafe(dirPath, { recursive: true });
    await expect(stat(dirPath)).rejects.toEqual(
      expect.objectContaining({ code: 'ENOENT' })
    );
  });

  test('does nothing for nonexistent file', async () => {
    await cleanupSafe('/nonexistent/file.txt');
  });

  test('does nothing for nonexistent directory', async () => {
    await cleanupSafe('/nonexistent/dir', { recursive: true });
  });
});
