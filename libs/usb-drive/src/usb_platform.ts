import { throwIllegalValue } from '@votingworks/basics';
import { join } from 'node:path';
import {
  createBlockDeviceChangeWatcher,
  getAllDiskDevices,
  isFat32Partition,
  isSupportedPartition,
} from './block_devices';
import { exec } from './exec';
import {
  UsbDiskDevPath,
  UsbDriveFilesystemType,
  UsbPartitionDevPath,
  UsbPartitionMountpoint,
} from './types';
import {
  DriveWatcher,
  UsbPlatform,
  UsbPlatformDrive,
} from './usb_platform_types';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

export class RealUsbPlatform implements UsbPlatform {
  async getDrives(): Promise<UsbPlatformDrive[]> {
    const drives = await getAllDiskDevices();
    return drives.map((drive): UsbPlatformDrive => {
      const partition =
        drive.partitions.length === 1 ? drive.partitions[0] : undefined;

      if (!partition || !isSupportedPartition(partition)) {
        return { diskPath: drive.diskPath };
      }

      return {
        diskPath: drive.diskPath,
        partition: {
          partPath: partition.partPath,
          fstype: isFat32Partition(partition) ? 'fat32' : 'ext4',
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
    fstype: UsbDriveFilesystemType,
    label: string
  ): Promise<void> {
    switch (fstype) {
      case 'fat32':
        await exec('sudo', [
          '-n',
          join(MOUNT_SCRIPT_PATH, 'format_fat32.sh'),
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
      /* istanbul ignore start */
      default:
        throwIllegalValue(fstype);
      /* istanbul ignore stop */
    }
  }

  async sync(mountpoint: UsbPartitionMountpoint): Promise<void> {
    await exec('sync', ['-f', mountpoint]);
  }
}
