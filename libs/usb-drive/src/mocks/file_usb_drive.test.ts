import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  addMockDrive,
  createMockFileMultiUsbDrive,
  createMockFileUsbDrive,
  getMockFileUsbDriveHandler,
  listMockDrives,
  removeMockDriveDir,
} from './file_usb_drive';

function cleanupAllMockDrives(): void {
  for (const diskName of listMockDrives()) {
    removeMockDriveDir(diskName);
  }
}

test('createMockFileMultiUsbDrive mock flow', async () => {
  cleanupAllMockDrives();
  const handler = getMockFileUsbDriveHandler('sdb');
  const multiUsbDrive = createMockFileMultiUsbDrive();

  expect(multiUsbDrive.getDrives()).toEqual([]);

  await expect(multiUsbDrive.refresh()).resolves.toBeUndefined();
  await expect(multiUsbDrive.sync('/dev/sdb1')).resolves.toBeUndefined();
  multiUsbDrive.stop();

  handler.insert();
  const mountPoint = handler.getDataPath();
  expect(multiUsbDrive.getDrives()).toEqual([
    {
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          fstype: 'vfat',
          fsver: 'FAT32',
          mount: { type: 'mounted', mountPoint },
        },
      ],
    },
  ]);

  await multiUsbDrive.ejectDrive('/dev/sdb');
  expect(multiUsbDrive.getDrives()).toEqual([
    {
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          fstype: 'vfat',
          fsver: 'FAT32',
          mount: { type: 'ejected' },
        },
      ],
    },
  ]);

  await multiUsbDrive.ejectDrive('/dev/sdb');
  expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
    type: 'ejected',
  });

  handler.insert();
  await multiUsbDrive.formatDrive('/dev/sdb', 'fat32');
  expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
    type: 'ejected',
  });

  handler.remove();
  expect(multiUsbDrive.getDrives()).toEqual([]);

  handler.cleanup();
});

test('createMockFileMultiUsbDrive multi-drive flow', async () => {
  cleanupAllMockDrives();
  const multiUsbDrive = createMockFileMultiUsbDrive();

  const diskA = addMockDrive();
  const diskB = addMockDrive();
  const handlerA = getMockFileUsbDriveHandler(diskA);
  const handlerB = getMockFileUsbDriveHandler(diskB);

  expect(multiUsbDrive.getDrives()).toEqual([]);

  handlerA.insert();
  expect(multiUsbDrive.getDrives()).toHaveLength(1);
  expect(multiUsbDrive.getDrives()[0]?.devPath).toEqual(`/dev/${diskA}`);

  handlerB.insert();
  expect(multiUsbDrive.getDrives()).toHaveLength(2);

  await multiUsbDrive.ejectDrive(`/dev/${diskA}`);
  const drives = multiUsbDrive.getDrives();
  expect(drives).toHaveLength(2);
  expect(
    drives.find((d) => d.devPath === `/dev/${diskA}`)?.partitions[0]?.mount
  ).toEqual({ type: 'ejected' });
  expect(
    drives.find((d) => d.devPath === `/dev/${diskB}`)?.partitions[0]?.mount.type
  ).toEqual('mounted');

  handlerB.remove();
  removeMockDriveDir(diskB);
  expect(multiUsbDrive.getDrives()).toHaveLength(1);

  handlerA.cleanup();

  expect(listMockDrives()).not.toContain(diskB);
});

test('mock flow', async () => {
  cleanupAllMockDrives();
  const usbDrive = createMockFileUsbDrive();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  await expect(usbDrive.eject()).resolves.toBeUndefined();
  await expect(usbDrive.format()).resolves.toBeUndefined();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  const handler = getMockFileUsbDriveHandler();

  const testFilename = 'test-file.txt';
  handler.insert({
    [testFilename]: Buffer.from('test file contents'),
  });
  const expectedMountPoint = handler.getDataPath();
  expect(await usbDrive.status()).toMatchObject({
    mountPoint: expectedMountPoint,
    status: 'mounted',
  });

  expect(handler.getDataPath()).toEqual(expectedMountPoint);
  const expectedTestFilePath = join(expectedMountPoint!, testFilename);
  expect(existsSync(expectedTestFilePath)).toEqual(true);

  await usbDrive.eject();
  expect(await usbDrive.status()).toEqual({ status: 'ejected' });

  handler.remove();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  expect(existsSync(expectedTestFilePath)).toEqual(true);

  handler.cleanup();
  expect(existsSync(expectedTestFilePath)).toEqual(false);
});
