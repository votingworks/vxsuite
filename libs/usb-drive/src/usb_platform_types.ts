import z from 'zod/v4';
import {
  UsbDiskDevPath,
  UsbDiskDevPathSchema,
  UsbDriveFilesystemType,
  UsbPartitionDevPath,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpoint,
  UsbPartitionMountpointSchema,
} from './types';

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
