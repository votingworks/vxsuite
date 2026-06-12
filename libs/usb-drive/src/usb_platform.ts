import { throwIllegalValue } from '@votingworks/basics';
import { join } from 'node:path';
import z from 'zod/v4';
import {
  createBlockDeviceChangeWatcher,
  getAllDiskDevices,
} from './block_devices';
import { exec } from './exec';
import {
  UsbDiskDevPath,
  UsbDiskDevPathSchema,
  UsbDriveFilesystemType,
  UsbPartitionDevPath,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpoint,
  UsbPartitionMountpointSchema,
} from './types';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

export function isFat32Partition(partition?: {
  fstype?: string;
  fsver?: string;
}): boolean {
  return partition?.fstype === 'vfat' && partition.fsver === 'FAT32';
}

export function isExt4Partition(partition?: { fstype?: string }): boolean {
  return partition?.fstype === 'ext4';
}

function isSupportedPartition(partition?: {
  fstype?: string;
  fsver?: string;
}): boolean {
  return isFat32Partition(partition) || isExt4Partition(partition);
}

export interface DriveWatcher {
  stop(): void;
}

export interface UsbPlatform {
  /**
   * Get all drives and their usable partitions.
   */
  getDrives(): Promise<UsbPlatformDrive[]>;

  /**
   * Watch for changes to the list of drives. Call {@link DriveWatcher.stop} to
   * stop watching.
   */
  watchChanges(onChange: () => void): DriveWatcher;

  /**
   * Mount a partition by its path (e.g. `/dev/sda1`).
   */
  mountPartition(partPath: UsbPartitionDevPath): Promise<void>;

  /**
   * Unmount a partition by its mount point (e.g. `/media/vx/usb-drive-sda1`).
   */
  unmountPartition(mountpoint: UsbPartitionMountpoint): Promise<void>;

  /**
   * Format a drive with the specified filesystem type and label.
   */
  formatDrive(
    diskPath: UsbDiskDevPath,
    fstype: UsbDriveFilesystemType,
    label: string
  ): Promise<void>;

  /**
   * Sync the contents of a mounted partition to disk.
   */
  sync(mountpoint: UsbPartitionMountpoint): Promise<void>;
}

export const UsbPlatformPartitionSchema = z.object({
  partPath: UsbPartitionDevPathSchema,
  fstype: z.enum(['fat32', 'ext4']),
  label: z.string().optional(),
  mountpoint: UsbPartitionMountpointSchema.optional(),
});

/**
 * Platform representation of a USB drive partition.
 */
export type UsbPlatformPartition = z.output<typeof UsbPlatformPartitionSchema>;

export const UsbPlatformDriveSchema = z.object({
  diskPath: UsbDiskDevPathSchema,
  partition: UsbPlatformPartitionSchema.optional(),
});

/**
 * Platform representation of a USB drive, including a single valid partition
 * if any is present. A missing partition means the drive has no usable
 * partitions, not that there are no partitions at all.
 */
export type UsbPlatformDrive = z.output<typeof UsbPlatformDriveSchema>;

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
