import { Optional, throwIllegalValue } from '@votingworks/basics';
import { z } from 'zod/v4';

export type UsbDriveStatus =
  | { status: 'no_drive' }
  | MountedUsbDriveStatus
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format' };

export interface MountedUsbDriveStatus {
  status: 'mounted';
  mountpoint: UsbPartitionMountpoint;
  fstype: UsbDriveFilesystemType;
  /** Largest file the drive's file system can hold, if it has such a limit. */
  maxFileSize?: number;
}

export function mountedUsbDriveStatus(
  mountpoint: UsbPartitionMountpoint,
  fstype: UsbDriveFilesystemType
): MountedUsbDriveStatus {
  const maxFileSize = getUsbDriveMaximumFileSize(fstype);
  return {
    status: 'mounted',
    mountpoint,
    fstype,
    ...(maxFileSize === undefined ? {} : { maxFileSize }),
  };
}

/**
 * A branded string type for USB disk device paths, e.g. `/dev/sdb`.
 */
export const UsbDiskDevPathSchema = z
  .string()
  .regex(/^\/dev\/[a-z0-9]+$/)
  .brand('UsbDiskDevPath');

/**
 * A branded string type for USB partition device paths, e.g. `/dev/sdb1`.
 */
export const UsbPartitionDevPathSchema = z
  .string()
  .regex(/^\/dev\/[a-z0-9]+[0-9]$/)
  .brand('UsbPartitionDevPath');

/**
 * A branded string type for USB partition mountpoints, e.g.
 * `/media/vx/usb-drive-sdb1`.
 */
export const UsbPartitionMountpointSchema = z
  .string()
  .regex(/^\//)
  .brand('UsbPartitionMountpoint');

/**
 * A branded string type for USB disk device paths, e.g. `/dev/sdb`.
 */
export type UsbDiskDevPath = z.output<typeof UsbDiskDevPathSchema>;

/**
 * A branded string type for USB partition device paths, e.g. `/dev/sdb1`.
 */
export type UsbPartitionDevPath = z.output<typeof UsbPartitionDevPathSchema>;

/**
 * A branded string type for USB partition mountpoints, e.g.
 * `/media/vx/usb-drive-sdb1`.
 */
export type UsbPartitionMountpoint = z.output<
  typeof UsbPartitionMountpointSchema
>;

export interface UsbDrive {
  status(): Promise<UsbDriveStatus>;
  eject(): Promise<void>;
  format(fstype: UsbDriveFilesystemType): Promise<void>;
  sync(): Promise<void>;
}

/**
 * A USB drive with `partition` set if it has a single supported partition.
 */
export interface UsbDriveInfo {
  diskPath: UsbDiskDevPath;
  partition?: UsbPartitionInfo;
}

/**
 * A USB partition with one of the supported file systems.
 */
export interface UsbPartitionInfo {
  diskPath: UsbDiskDevPath;
  partPath: UsbPartitionDevPath;
  fstype: UsbDriveFilesystemType;
  mount: UsbPartitionMount;
  label?: string;
}

export const UsbPartitionMount = {
  unmounted: (): UsbPartitionMount => ({ type: 'unmounted' }),
  ejected: (): UsbPartitionMount => ({ type: 'ejected' }),
  mounting: (): UsbPartitionMount => ({ type: 'mounting' }),
  formatting: (): UsbPartitionMount => ({ type: 'formatting' }),
  mounted: (mountpoint: UsbPartitionMountpoint): UsbPartitionMount => ({
    type: 'mounted',
    mountpoint,
  }),
  unmounting: (mountpoint: UsbPartitionMountpoint): UsbPartitionMount => ({
    type: 'unmounting',
    mountpoint,
  }),
} as const;

export type UsbPartitionMount =
  | { type: 'unmounted' }
  | { type: 'ejected' }
  | { type: 'mounting' }
  | { type: 'formatting' }
  | { type: 'mounted'; mountpoint: UsbPartitionMountpoint }
  | { type: 'unmounting'; mountpoint: UsbPartitionMountpoint };

export const UsbDriveFilesystemTypeSchema = z.enum(['fat32', 'ext4']);
export type UsbDriveFilesystemType = z.output<
  typeof UsbDriveFilesystemTypeSchema
>;

/** FAT32 stores file sizes as unsigned 32-bit integers. */
const FAT32_MAXIMUM_FILE_SIZE = 2 ** 32 - 1;

/**
 * Largest file the file system can hold, in bytes. `undefined` when the limit
 * exceeds any file we would write.
 */
export function getUsbDriveMaximumFileSize(
  fstype: UsbDriveFilesystemType
): Optional<number> {
  switch (fstype) {
    case 'fat32':
      return FAT32_MAXIMUM_FILE_SIZE;
    case 'ext4':
      return undefined;
    default:
      return throwIllegalValue(fstype);
  }
}
