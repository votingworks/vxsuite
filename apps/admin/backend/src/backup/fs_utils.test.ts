import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';

import {
  cleanupDirSafe,
  cleanupSafe,
  formatBytes,
  getAvailableDiskSpace,
} from './fs_utils';

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

  test('formats megabytes', () => {
    expect(formatBytes(5_000_000)).toEqual('5 MB');
  });

  test('formats gigabytes', () => {
    expect(formatBytes(2_500_000_000)).toEqual('2.5 GB');
  });
});

describe('cleanupSafe', () => {
  test('removes a file', async () => {
    const tmpDir = makeTemporaryDirectory();
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'data');
    expect(existsSync(filePath)).toEqual(true);
    await cleanupSafe(filePath);
    expect(existsSync(filePath)).toEqual(false);
  });

  test('does nothing for nonexistent file', async () => {
    await cleanupSafe('/nonexistent/file.txt');
  });
});

describe('cleanupDirSafe', () => {
  test('removes a directory recursively', async () => {
    const tmpDir = makeTemporaryDirectory();
    const dirPath = join(tmpDir, 'subdir');
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, 'file.txt'), 'data');
    expect(existsSync(dirPath)).toEqual(true);
    await cleanupDirSafe(dirPath);
    expect(existsSync(dirPath)).toEqual(false);
  });

  test('does nothing for nonexistent directory', async () => {
    await cleanupDirSafe('/nonexistent/dir');
  });
});
