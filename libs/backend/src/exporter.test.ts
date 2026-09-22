import { afterEach, expect, test, vi } from 'vitest';
import { err, iter, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  createMockUsbDrive,
  UsbPartitionMountpointSchema,
} from '@votingworks/usb-drive';
import { Exporter, ExportDataResult } from './exporter.js';
import { execFile } from './exec.js';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec.js')> => ({
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

test('exportData path escaping the allowed patterns with ..', async () => {
  expect(
    (await exporter.exportData('/tmp/../etc/passwd', 'bar')).err()?.message
  ).toMatch(/Path is not allowed/);
});

test('exportData path whose .. segments resolve back inside an allowed pattern', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'subdir', '..', 'test.txt');
  const result = await exporter.exportData(path, 'bar');
  expect(result).toEqual(ok([join(tmpDir, 'test.txt')]));
  expect(await readFile(join(tmpDir, 'test.txt'), 'utf-8')).toEqual('bar');
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

test.runIf(existsSync('/dev/null'))(
  'exportData to a device is not a regular file',
  async () => {
    const exporterAllowingDev = new Exporter({
      allowedExportPatterns: ['/dev/**'],
      usbDrive,
    });
    const result = await exporterAllowingDev.exportData('/dev/null', 'bar');
    expect(result).toEqual<ExportDataResult>(
      err({
        type: 'file-system-error',
        message: expect.stringContaining('Path is not a regular file'),
      })
    );
  }
);

test('exportData to a FIFO fails instead of blocking', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'fifo');
  execFileSync('mkfifo', [path]);
  const result = await exporter.exportData(path, 'bar');
  expect(result).toEqual<ExportDataResult>(
    err({
      type: 'file-system-error',
      message: expect.stringContaining('ENXIO'),
    })
  );
});

test('exportData to a directory is an open error', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'dir');
  await mkdir(path);
  const result = await exporter.exportData(path, 'bar');
  expect(result).toEqual<ExportDataResult>(
    err({
      type: 'file-system-error',
      message: expect.stringContaining('EISDIR'),
    })
  );
});

test('exportData with a failing write is a file system error', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'test.txt');
  const result = await exporter.exportData(
    path,
    Readable.from(
      (function* failingSource() {
        yield 'partial';
        throw new Error('EFBIG: file too large');
      })()
    )
  );
  expect(result).toEqual<ExportDataResult>(
    err({
      type: 'file-system-error',
      message: expect.stringContaining('EFBIG'),
    })
  );
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

test('exportData destroys a stream it does not write', async () => {
  const data = Readable.from('bar');
  expect(await exporter.exportData('/etc/passwd', data)).toEqual(
    err({
      type: 'permission-denied',
      message: 'Path is not allowed: /etc/passwd',
    })
  );
  expect(data.destroyed).toEqual(true);
});

test('exportDataToUsbDrive with no drives destroys the stream', async () => {
  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  const data = Readable.from('bar');
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    data
  );
  expect(result).toEqual(
    err({ type: 'missing-usb-drive', message: 'No USB drive found' })
  );
  expect(data.destroyed).toEqual(true);
});

test('exportDataToUsbDrive with a size that does not fit destroys the stream', async () => {
  const tmpDir = makeTemporaryDirectory();
  usbDrive.status.expectCallWith().resolves({
    status: 'mounted',
    fstype: 'exfat',
    mountpoint: UsbPartitionMountpointSchema.decode(tmpDir),
    totalBytes: 2 ** 20,
    availableBytes: 2 ** 20,
  });
  const data = Readable.from('bar');
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    data,
    { size: 2 ** 20 }
  );
  expect(result.err()?.type).toEqual('insufficient-space');
  expect(data.destroyed).toEqual(true);
});

test('exportDataToUsbDrive happy path', async () => {
  const tmpDir = makeTemporaryDirectory();
  const path = join(tmpDir, 'bucket/test.txt');
  usbDrive.status.expectCallWith().resolves({
    status: 'mounted',
    fstype: 'exfat',
    mountpoint: UsbPartitionMountpointSchema.decode(tmpDir),
  });
  usbDrive.sync.expectCallWith().resolves();
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar'
  );
  expect(result).toEqual(ok([path]));
  expect(await readFile(path, 'utf-8')).toEqual('bar');
});

test('exportDataToUsbDrive with a size that fits', async () => {
  const tmpDir = makeTemporaryDirectory();
  usbDrive.status.expectCallWith().resolves({
    status: 'mounted',
    fstype: 'fat32',
    maxFileSize: 2 ** 32 - 1,
    mountpoint: UsbPartitionMountpointSchema.decode(tmpDir),
    totalBytes: 2 ** 40,
    availableBytes: 2 ** 40,
  });
  usbDrive.sync.expectCallWith().resolves();
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar',
    { size: 3 }
  );
  expect(result).toEqual(ok([join(tmpDir, 'bucket/test.txt')]));
});

test('exportDataToUsbDrive with a size over the file system limit', async () => {
  const tmpDir = makeTemporaryDirectory();
  usbDrive.status.expectCallWith().resolves({
    status: 'mounted',
    fstype: 'fat32',
    maxFileSize: 2 ** 32 - 1,
    mountpoint: UsbPartitionMountpointSchema.decode(tmpDir),
    totalBytes: 2 ** 40,
    availableBytes: 2 ** 40,
  });
  const result = await exporter.exportDataToUsbDrive(
    'bucket',
    'test.txt',
    'bar',
    { size: 2 ** 32 }
  );
  expect(result).toEqual<ExportDataResult>(
    err({
      type: 'file-too-large',
      message: "File of 4.0 GB exceeds the USB drive's 4.0 GB file size limit",
    })
  );
  expect(existsSync(join(tmpDir, 'bucket'))).toEqual(false);
});

test.each([
  { totalBytes: 2 ** 40, availableBytes: 2 ** 20 },
  { totalBytes: 2 ** 20, availableBytes: 2 ** 20 },
])(
  'exportDataToUsbDrive with a size over the available space %o',
  async ({ totalBytes, availableBytes }) => {
    const tmpDir = makeTemporaryDirectory();
    usbDrive.status.expectCallWith().resolves({
      status: 'mounted',
      fstype: 'exfat',
      mountpoint: UsbPartitionMountpointSchema.decode(tmpDir),
      totalBytes,
      availableBytes,
    });
    const result = await exporter.exportDataToUsbDrive(
      'bucket',
      'test.txt',
      'bar',
      { size: 2 ** 20 }
    );
    expect(result).toEqual<ExportDataResult>(
      err({
        type: 'insufficient-space',
        message:
          'File of 1.0 MB does not fit in the 1.0 MB available on the USB drive',
      })
    );
    expect(existsSync(join(tmpDir, 'bucket'))).toEqual(false);
  }
);

test('exportDataToUsbDrive with machineDirectoryToWriteToFirst', async () => {
  const tmpDir = makeTemporaryDirectory();
  usbDrive.status.expectCallWith().resolves({
    status: 'mounted',
    fstype: 'exfat',
    mountpoint: UsbPartitionMountpointSchema.decode(tmpDir),
  });
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
