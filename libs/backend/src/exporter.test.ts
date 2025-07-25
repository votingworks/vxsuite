import { afterEach, expect, test, vi } from 'vitest';
import { err, iter, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { Exporter, ExportDataResult } from './exporter';
import { execFile } from './exec';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

const mockUsbDrive = createMockUsbDrive();
const { usbDrive } = mockUsbDrive;

const exporter = new Exporter({
  allowedExportPatterns: ['/tmp/**'],
  usbDrive,
});

afterEach(() => {
  mockUsbDrive.assertComplete();
});

test('exportData with string', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, 'bar');
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('bar');
});

test('exportData with Buffer', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, Buffer.of(1, 2, 3));
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of(1, 2, 3));
});

test('exportData with Uint8Array', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, Uint8Array.of(1, 2, 3));
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of(1, 2, 3));
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

test('exportData with iterable', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, ['foo', 'bar']);
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('foobar');
});

test('exportData with async iterable', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, iter(['foo', 'bar']).async());
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('foobar');
});

test('exportData with stream', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(
    path,
    Readable.from(Buffer.of(1, 2, 3))
  );
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of(1, 2, 3));
});

test('exportData with stream and maximumFileSize', async () => {
  const tmpDir = makeTemporaryDirectory();
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
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, '');
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of());
});

test('exportData with empty stream', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(path, Readable.from([]));
  expect(result).toEqual(ok([path]));
  expect(await readFile(path)).toEqual(Buffer.of());
});

test('exportData with a symbolic link', async () => {
  const tmpDir = makeTemporaryDirectory();
  const existingPath = join(tmpDir, 'test.txt');
  const linkPath = join(tmpDir, 'test-link.txt');
  await writeFile(existingPath, 'bar');
  await symlink(existingPath, linkPath);
  const result = await exporter.exportData(linkPath, 'bar');
  expect(result).toEqual<ExportDataResult>(
    err({
      type: 'permission-denied',
      message: expect.stringContaining('Path must not contain symbolic links'),
    })
  );
});

test('exportDataToUsbDrive with no drives', async () => {
  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar'
  );
  expect(result.err()?.message).toMatch(/No USB drive found/);
  expect(vi.mocked(execFile)).not.toHaveBeenCalled();
});

test('exportDataToUsbDrive happy path', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'bucket/test.txt');
  usbDrive.status
    .expectCallWith()
    .resolves({ status: 'mounted', mountPoint: tmpDir });
  usbDrive.sync.expectCallWith().resolves();
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar'
  );
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('bar');
});

test('exportDataToUsbDrive with maximumFileSize', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'bucket/test.txt');
  usbDrive.status
    .expectCallWith()
    .resolves({ status: 'mounted', mountPoint: tmpDir });
  usbDrive.sync.expectCallWith().resolves();
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
});

test('exportDataToUsbDrive with machineDirectoryToWriteToFirst', async () => {
  const tmpDir = makeTemporaryDirectory();
  usbDrive.status
    .expectCallWith()
    .resolves({ status: 'mounted', mountPoint: tmpDir });
  usbDrive.sync.expectCallWith().resolves();

  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    Readable.from('1234'),
    { machineDirectoryToWriteToFirst: '/tmp/abcd' }
  );
  const usbFilePath = join(tmpDir, 'bucket/test.txt');
  const machineFilePath = '/tmp/abcd/test.txt';
  expect(result).toEqual(ok([usbFilePath]));
  expect(await readFile(usbFilePath, 'utf-8')).toEqual('1234');
  expect(await readFile(machineFilePath, 'utf-8')).toEqual('1234');
});
