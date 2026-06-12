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
import {
  UsbDiskDevPathSchema,
  UsbDriveInfo,
  UsbPartitionDevPathSchema,
  UsbPartitionMount,
  UsbPartitionMountpointSchema,
} from '../types';

const devsdb = UsbDiskDevPathSchema.parse('/dev/sdb');
const devsdb1 = UsbPartitionDevPathSchema.parse('/dev/sdb1');

test('createMockFileMultiUsbDrive mock flow', async () => {
  const handler = getMockFileUsbDriveHandler('sdb');
  const multiUsbDrive = createMockFileMultiUsbDrive();

  expect(multiUsbDrive.getDrives()).toEqual([]);

  await expect(multiUsbDrive.refresh()).resolves.toBeUndefined();
  await expect(multiUsbDrive.sync(devsdb1)).resolves.toBeUndefined();
  multiUsbDrive.stop();

  handler.insert();
  const mountpoint = handler.getDataPath();
  expect(multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([
    {
      diskPath: devsdb,
      partition: {
        diskPath: devsdb,
        partPath: devsdb1,
        fstype: 'fat32',
        mount: UsbPartitionMount.mounted(
          UsbPartitionMountpointSchema.parse(mountpoint!)
        ),
      },
    },
  ]);

  await multiUsbDrive.ejectDrive(devsdb);
  expect(multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([
    {
      diskPath: devsdb,
      partition: {
        diskPath: devsdb,
        partPath: devsdb1,
        fstype: 'fat32',
        mount: UsbPartitionMount.ejected(),
      },
    },
  ]);

  await multiUsbDrive.ejectDrive(devsdb);
  expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
    UsbPartitionMount.ejected()
  );

  handler.insert();
  await multiUsbDrive.formatDrive(devsdb, 'fat32');
  expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
    UsbPartitionMount.ejected()
  );

  handler.remove();
  expect(multiUsbDrive.getDrives()).toEqual([]);

  handler.cleanup();
});

test('createMockFileMultiUsbDrive multi-drive flow', async () => {
  const multiUsbDrive = createMockFileMultiUsbDrive();

  const diskA = addMockDrive();
  const diskB = addMockDrive();
  const devdiskA = UsbDiskDevPathSchema.parse(`/dev/${diskA}`);
  const devdiskB = UsbDiskDevPathSchema.parse(`/dev/${diskB}`);
  const handlerA = getMockFileUsbDriveHandler(diskA);
  const handlerB = getMockFileUsbDriveHandler(diskB);

  expect(multiUsbDrive.getDrives()).toEqual([]);

  handlerA.insert();
  expect(multiUsbDrive.getDrives()).toHaveLength(1);
  expect(multiUsbDrive.getDrives()[0]?.diskPath).toEqual(devdiskA);

  handlerB.insert();
  expect(multiUsbDrive.getDrives()).toHaveLength(2);

  await multiUsbDrive.ejectDrive(devdiskA);
  const drives = multiUsbDrive.getDrives();
  expect(drives).toHaveLength(2);
  expect(drives.find((d) => d.diskPath === devdiskA)?.partition?.mount).toEqual(
    UsbPartitionMount.ejected()
  );
  expect(drives.find((d) => d.diskPath === devdiskB)?.partition?.mount).toEqual(
    UsbPartitionMount.mounted(expect.any(String))
  );

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
  await expect(usbDrive.format('fat32')).resolves.toBeUndefined();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  const handler = getMockFileUsbDriveHandler();

  const testFilename = 'test-file.txt';
  handler.insert({
    [testFilename]: Buffer.from('test file contents'),
  });
  const expectedMountPoint = handler.getDataPath();
  expect(await usbDrive.status()).toMatchObject({
    mountpoint: expectedMountPoint,
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
