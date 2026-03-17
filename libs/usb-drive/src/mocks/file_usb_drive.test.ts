import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import {
  addMockDrive,
  createMockFileMultiUsbDrive,
  createMockFileUsbDrive,
  getMockFileUsbDriveHandler,
  listMockDrives,
  removeMockDriveDir,
} from './file_usb_drive';

test('createMockFileMultiUsbDrive mock flow', async () => {
  const handler = getMockFileUsbDriveHandler('sdb');
  const multiUsbDrive = createMockFileMultiUsbDrive();

  // Initially no drive
  expect(multiUsbDrive.getDrives()).toEqual([]);

  // Refresh and sync are no-ops
  await expect(multiUsbDrive.refresh()).resolves.toBeUndefined();
  await expect(multiUsbDrive.sync('/dev/sdb1')).resolves.toBeUndefined();
  multiUsbDrive.stop();

  // Insert drive — getDrives returns mounted partition
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

  // Eject — partition becomes ejected
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

  // Eject when already ejected is a no-op
  await multiUsbDrive.ejectDrive('/dev/sdb');
  expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
    type: 'ejected',
  });

  // Format re-ejects (same behavior)
  handler.insert();
  await multiUsbDrive.formatDrive('/dev/sdb');
  expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
    type: 'ejected',
  });

  // Remove drive — getDrives returns empty
  handler.remove();
  expect(multiUsbDrive.getDrives()).toEqual([]);

  handler.cleanup();
});

test('createMockFileMultiUsbDrive multi-drive flow', async () => {
  const multiUsbDrive = createMockFileMultiUsbDrive();

  // Add two drives
  const diskA = addMockDrive();
  const diskB = addMockDrive();
  const handlerA = getMockFileUsbDriveHandler(diskA);
  const handlerB = getMockFileUsbDriveHandler(diskB);

  // Both removed — getDrives returns empty
  expect(multiUsbDrive.getDrives()).toEqual([]);

  // Insert first drive
  handlerA.insert();
  expect(multiUsbDrive.getDrives()).toHaveLength(1);
  expect(multiUsbDrive.getDrives()[0]?.devPath).toEqual(`/dev/${diskA}`);

  // Insert second drive
  handlerB.insert();
  expect(multiUsbDrive.getDrives()).toHaveLength(2);

  // Eject first drive only
  await multiUsbDrive.ejectDrive(`/dev/${diskA}`);
  const drives = multiUsbDrive.getDrives();
  expect(drives).toHaveLength(2);
  expect(
    drives.find((d) => d.devPath === `/dev/${diskA}`)?.partitions[0]?.mount
  ).toEqual({ type: 'ejected' });
  expect(
    drives.find((d) => d.devPath === `/dev/${diskB}`)?.partitions[0]?.mount.type
  ).toEqual('mounted');

  // Remove second drive slot
  handlerB.remove();
  removeMockDriveDir(diskB);
  expect(multiUsbDrive.getDrives()).toHaveLength(1);

  handlerA.cleanup();

  expect(listMockDrives()).not.toContain(diskB);
});

test('mock flow', async () => {
  const usbDrive = createMockFileUsbDrive();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  await expect(usbDrive.eject()).resolves.toBeUndefined();
  await expect(usbDrive.format()).resolves.toBeUndefined();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  const handler = getMockFileUsbDriveHandler();

  // Insert USB drive
  const testFilename = 'test-file.txt';
  handler.insert({
    [testFilename]: Buffer.from('test file contents'),
  });
  const expectedMountPoint = handler.getDataPath();
  expect(await usbDrive.status()).toMatchObject({
    mountPoint: expectedMountPoint,
    status: 'mounted',
  });

  // USB drive contents are accessible
  expect(handler.getDataPath()).toEqual(expectedMountPoint);
  const expectedTestFilePath = `${expectedMountPoint}/${testFilename}`;
  expect(existsSync(expectedTestFilePath)).toEqual(true);

  // Eject USB drive
  await usbDrive.eject();
  expect(await usbDrive.status()).toEqual({ status: 'ejected' });

  // Remove USB drive
  handler.remove();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  // USB drive contents should still exist
  expect(existsSync(expectedTestFilePath)).toEqual(true);

  // Cleanup
  handler.cleanup();
  expect(existsSync(expectedTestFilePath)).toEqual(false);
});
