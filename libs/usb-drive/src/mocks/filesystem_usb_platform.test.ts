import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { backendWaitFor } from '@votingworks/test-utils';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { UsbDiskDeviceInfo } from '../block_devices';
import { FilesystemUsbController } from './filesystem_usb_platform';
import { UsbController } from './usb_controller';

async function readTestFile(controller: UsbController): Promise<string> {
  return await readFile(
    join(controller.getMainPartitionMountPoint(), 'README'),
    'utf-8'
  );
}

async function writeTestFile(
  controller: UsbController,
  data: string
): Promise<void> {
  await writeFile(
    join(controller.getMainPartitionMountPoint(), 'README'),
    data
  );
}

test('full lifecycle', async () => {
  const controller = new FilesystemUsbController(makeTemporaryDirectory());
  const onDeviceChange = vi.fn();
  const watcher = controller.platform.watchChanges(onDeviceChange);
  expect(onDeviceChange).toHaveBeenCalledTimes(0);

  controller.insertDrive({}, { devPath: '/dev/sdb', fstype: 'fat32' });
  await backendWaitFor(() => {
    expect(onDeviceChange).toHaveBeenCalledTimes(1);
  });
  await expect(controller.platform.getAllUsbDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbDiskDeviceInfo>>({
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          fstype: 'vfat',
          fsver: 'FAT32',
        },
      ],
    }),
  ]);

  await controller.platform.mountPartition('/dev/sdb1');
  await backendWaitFor(() => {
    expect(onDeviceChange).toHaveBeenCalledTimes(2);
  });
  const drives = await controller.platform.getAllUsbDrives();
  expect(drives).toEqual([
    expect.objectContaining<Partial<UsbDiskDeviceInfo>>({
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: expect.any(String),
          fstype: 'vfat',
          fsver: 'FAT32',
        },
      ],
    }),
  ]);

  await writeTestFile(controller, 'hello world');

  await controller.platform.unmountPartition(
    controller.getMainPartitionMountPoint()
  );
  await backendWaitFor(() => {
    expect(onDeviceChange).toHaveBeenCalledTimes(3);
  });
  await expect(controller.platform.getAllUsbDrives()).resolves.toEqual([
    expect.objectContaining<Partial<UsbDiskDeviceInfo>>({
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          fstype: 'vfat',
          fsver: 'FAT32',
        },
      ],
    }),
  ]);

  await controller.platform.mountPartition('/dev/sdb1');
  await backendWaitFor(() => {
    expect(onDeviceChange).toHaveBeenCalledTimes(4);
  });
  const afterRemountDrives = await controller.platform.getAllUsbDrives();
  expect(afterRemountDrives).toEqual([
    expect.objectContaining<Partial<UsbDiskDeviceInfo>>({
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          fstype: 'vfat',
          fsver: 'FAT32',
          // Ensure the mountpoint is the same as the last time it was mounted.
          // Files written to the partition should be preserved on unmount.
          mountpoint: controller.getMainPartitionMountPoint(),
        },
      ],
    }),
  ]);

  await expect(readTestFile(controller)).resolves.toEqual('hello world');

  controller.removeDrive('/dev/sdb');
  // 4 + 1 for partition unmount + 1 for drive removal
  await backendWaitFor(() => {
    expect(onDeviceChange).toHaveBeenCalledTimes(6);
  });

  controller.insertDrive({}, { devPath: '/dev/sdb', fstype: 'fat32' });
  expect(onDeviceChange).toHaveBeenCalledTimes(7);

  // Removing and re-inserting a drive should clear any contents.
  await expect(readTestFile(controller)).rejects.toThrow();

  await writeTestFile(controller, 'should be cleared by formatDrive');

  await controller.platform.formatDrive('/dev/sdb', 'ext4', 'GOODIES');
  expect(onDeviceChange).toHaveBeenCalledTimes(8);

  await controller.platform.mountPartition('/dev/sdb1');
  expect(onDeviceChange).toHaveBeenCalledTimes(9);

  const afterFormatDrives = await controller.platform.getAllUsbDrives();
  expect(afterFormatDrives).toEqual([
    expect.objectContaining<Partial<UsbDiskDeviceInfo>>({
      devPath: '/dev/sdb',
      partitions: [
        {
          devPath: '/dev/sdb1',
          fstype: 'ext4',
          fsver: '1.0',
          label: 'GOODIES',
          mountpoint: expect.any(String),
        },
      ],
    }),
  ]);

  // Ensure the mount has been cleared of any files after the format.
  await expect(readTestFile(controller)).rejects.toThrow();

  watcher.stop();

  controller.removeDrive('/dev/sdb');
  controller.insertDrive({}, { devPath: '/dev/sdb', fstype: 'fat32' });
  controller.mountPartition('/dev/sdb1');

  // Memory platform `sync` doesn't really do anything.
  await controller.platform.sync(controller.getMainPartitionMountPoint());
  await expect(
    controller.platform.sync('/not/a/mounted/path')
  ).rejects.toThrow();

  controller.unmountPartition(controller.getMainPartitionMountPoint());
  controller.removeDrive('/dev/sdb');

  // No more calls after `watcher.stop()`.
  expect(onDeviceChange).toHaveBeenCalledTimes(9);
});
