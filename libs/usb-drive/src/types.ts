import { z } from 'zod/v4';

export type UsbDriveStatus =
  | { status: 'no_drive' }
  | {
      status: 'mounted';
      mountpoint: UsbPartitionMountpoint;
    }
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format' };

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
