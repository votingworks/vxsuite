import { mockOf } from '@votingworks/test-utils';
import { err, ok } from '@votingworks/types';
import { Buffer } from 'buffer';
import { readFile, symlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { DirResult, dirSync } from 'tmp';
import { Exporter, ExportFileResult } from './exporter';
import { UsbDrive } from './get_usb_drives';
import { execFile } from './utils/exec';

jest.mock('./utils/exec', (): typeof import('./utils/exec') => ({
  ...jest.requireActual('./utils/exec'),
  execFile: jest.fn(),
}));

const getUsbDrivesMock = jest.fn();
const execFileMock = mockOf(execFile);
const tmpDirs: DirResult[] = [];

function createTmpDir() {
  const tmpDir = dirSync({ unsafeCleanup: true });
  tmpDirs.push(tmpDir);
  return tmpDir.name;
}

const exporter = new Exporter({
  allowedExportPatterns: ['/tmp/**'],
  getUsbDrives: getUsbDrivesMock,
});

afterEach(() => {
  for (const tmpDir of tmpDirs) {
    tmpDir.removeCallback();
  }
  tmpDirs.length = 0;
});

test('exportData with string', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, 'bar');
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('bar');
});

test('exportData relative path', async () => {
  expect((await exporter.exportData('test.txt', 'bar')).err()?.message).toMatch(
    /Path must be absolute/
  );
});

test('exportData disallowed path', async () => {
  expect(
    (await exporter.exportData('/etc/passwd', 'bar')).err()?.message
  ).toMatch(/Path is not allowed/);
});

test('exportData with stream', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(
    path,
    Readable.from(Buffer.of(1, 2, 3))
  );
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of(1, 2, 3));
});

test('exportData with stream and maximumFileSize', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(
    path,
    Readable.from(Buffer.of(1, 2, 3)),
    {
      maximumFileSize: 2,
    }
  );
  expect(result).toEqual(ok([`${path}-part-1`, `${path}-part-2`]));
  expect(await readFile(`${path}-part-1`)).toEqual(Buffer.of(1, 2));
  expect(await readFile(`${path}-part-2`)).toEqual(Buffer.of(3));
});

test('exportData with empty string', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, '');
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of());
});

test('exportData with empty stream', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, Readable.from([]));
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of());
});

test('exportData with a symbolic link', async () => {
  const tmpDir = createTmpDir();
  const existingPath = join(tmpDir, 'test.txt');
  const linkPath = join(tmpDir, 'test-link.txt');
  await writeFile(existingPath, 'bar');
  await symlink(existingPath, linkPath);
  const result = await exporter.exportData(linkPath, 'bar');
  expect(result).toEqual<ExportFileResult>(
    err({
      type: 'permission-denied',
      message: expect.stringContaining('Path must not contain symbolic links'),
    })
  );
});

test('exportDataToUsbDrive with no drives', async () => {
  getUsbDrivesMock.mockResolvedValueOnce([]);
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar'
  );
  expect(result.err()?.message).toMatch(/No USB drive found/);
  expect(execFileMock).not.toHaveBeenCalled();
});

test('exportDataToUsbDrive happy path', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'bucket/test.txt');
  const drive: UsbDrive = {
    deviceName: '/dev/sdb',
    mountPoint: tmpDir,
  };
  getUsbDrivesMock.mockResolvedValueOnce([drive]);
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar'
  );
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('bar');
  expect(execFileMock).toHaveBeenCalledWith('sync', ['-f', drive.mountPoint]);
});

test('exportDataToUsbDrive with maximumFileSize', async () => {
  const tmpDir = createTmpDir();
  const path = join(tmpDir, 'bucket/test.txt');
  const drive: UsbDrive = {
    deviceName: '/dev/sdb',
    mountPoint: tmpDir,
  };
  getUsbDrivesMock.mockResolvedValueOnce([drive]);
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar',
    {
      maximumFileSize: 2,
    }
  );
  expect(result).toEqual(ok([`${path}-part-1`, `${path}-part-2`]));
  expect(await readFile(`${path}-part-1`, 'utf-8')).toEqual('ba');
  expect(await readFile(`${path}-part-2`, 'utf-8')).toEqual('r');
  expect(execFileMock).toHaveBeenCalledWith('sync', ['-f', drive.mountPoint]);
});
