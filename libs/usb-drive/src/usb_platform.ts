import { throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveSpace } from '@votingworks/utils';
import { statfs } from 'node:fs/promises';
import { join } from 'node:path';
import {
  classifyPartition,
  createBlockDeviceChangeWatcher,
  getAllDiskDevices,
} from './block_devices.js';
import { exec } from './exec.js';
import type {
  UsbDiskDevPath,
  UsbDriveFormatFilesystemType,
  UsbPartitionDevPath,
  UsbPartitionMountpoint,
} from './types.js';
import type {
  DriveWatcher,
  UsbPlatform,
  UsbPlatformDrive,
} from './usb_platform_types.js';

const MOUNT_SCRIPT_PATH = join(import.meta.dirname, '../scripts');

export class RealUsbPlatform implements UsbPlatform {
  async getDrives(): Promise<UsbPlatformDrive[]> {
    const drives = await getAllDiskDevices();
    return drives.map((drive): UsbPlatformDrive => {
      const partition =
        drive.partitions.length === 1 ? drive.partitions[0] : undefined;
      const fstype = classifyPartition(partition);

      if (!partition || !fstype) {
        return { diskPath: drive.diskPath };
      }

      return {
        diskPath: drive.diskPath,
        partition: {
          partPath: partition.partPath,
          fstype,
          label: partition.label,
          mountpoint: partition.mountpoint,
        },
      };
    });
  }

  watchChanges(onChange: () => void): DriveWatcher {
    return createBlockDeviceChangeWatcher(onChange);
  }

  async mountPartition(partPath: UsbPartitionDevPath): Promise<void> {
    await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'mount.sh'), partPath]);
  }

  async unmountPartition(mountpoint: UsbPartitionMountpoint): Promise<void> {
    await exec('sudo', [
      '-n',
      join(MOUNT_SCRIPT_PATH, 'unmount.sh'),
      mountpoint,
    ]);
  }

  async formatDrive(
    diskPath: UsbDiskDevPath,
    fstype: UsbDriveFormatFilesystemType,
    label: string
  ): Promise<void> {
    switch (fstype) {
      case 'exfat':
        await exec('sudo', [
          '-n',
          join(MOUNT_SCRIPT_PATH, 'format_exfat.sh'),
          diskPath,
          label,
        ]);
        break;
      case 'ext4':
        await exec('sudo', [
          '-n',
          join(MOUNT_SCRIPT_PATH, 'format_ext4.sh'),
          diskPath,
          label,
        ]);
        break;
      default:
        throwIllegalValue(fstype);
    }
  }

  async sync(mountpoint: UsbPartitionMountpoint): Promise<void> {
    await exec('sync', ['-f', mountpoint]);
  }

  async getSpace(mountpoint: UsbPartitionMountpoint): Promise<UsbDriveSpace> {
    return getSpaceAtPath(mountpoint);
  }
}

export async function getSpaceAtPath(path: string): Promise<UsbDriveSpace> {
  const stats = await statfs(path);
  return {
    totalBytes: stats.bsize * stats.blocks,
    availableBytes: stats.bsize * stats.bavail,
  };
}
