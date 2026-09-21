import { Optional, throwIllegalValue } from '@votingworks/basics';
import { UsbDriveSpace } from '@votingworks/utils';
import { z } from 'zod/v4';

export type UsbDriveStatus =
  | { status: 'no_drive' }
  | MountedUsbDriveStatus
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format' };

export interface MountedUsbDriveStatus extends Partial<UsbDriveSpace> {
  status: 'mounted';
  mountpoint: UsbPartitionMountpoint;
  fstype: UsbDriveFilesystemType;
  /** Largest file the drive's file system can hold, if it has such a limit. */
  maxFileSize?: number;
}

export function mountedUsbDriveStatus(
  mountpoint: UsbPartitionMountpoint,
  fstype: UsbDriveFilesystemType,
  space?: UsbDriveSpace
): MountedUsbDriveStatus {
  const maxFileSize = getUsbDriveMaximumFileSize(fstype);
  return {
    status: 'mounted',
    mountpoint,
    fstype,
    ...(maxFileSize === undefined ? {} : { maxFileSize }),
    ...(space ?? {}),
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
  format(fstype: UsbDriveFormatFilesystemType): Promise<void>;
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
export interface UsbPartitionInfo extends UsbPartitionBase {
  diskPath: UsbDiskDevPath;
  mount: UsbPartitionMount;
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

/**
 * File system formats that we support mounting for read & write.
 */
export const UsbDriveFilesystemTypeSchema = z.enum(['exfat', 'fat32', 'ext4']);

/**
 * File system formats that we support mounting for read & write.
 */
export type UsbDriveFilesystemType = z.output<
  typeof UsbDriveFilesystemTypeSchema
>;

/**
 * File system formats that we support formatting drives using.
 */
export const UsbDriveFormatFilesystemTypeSchema = z.enum(['fat32', 'ext4']);

/**
 * File system formats that we support formatting drives using.
 */
export type UsbDriveFormatFilesystemType = z.output<
  typeof UsbDriveFormatFilesystemTypeSchema
>;

/**
 * What a drive is used for: general file transfer (`data`) or backup & restore
 * (`backup`). Determined by the file system it's formatted with.
 */
export type UsbDrivePurpose = 'data' | 'backup';

export function getUsbDrivePurpose(
  fstype: UsbDriveFilesystemType
): UsbDrivePurpose {
  switch (fstype) {
    case 'exfat':
    case 'fat32':
      return 'data';
    case 'ext4':
      return 'backup';
    default:
      return throwIllegalValue(fstype);
  }
}

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
    case 'exfat':
    case 'ext4':
      return undefined;
    default:
      return throwIllegalValue(fstype);
  }
}

/**
 * The fields common to every representation of a supported partition.
 */
export const UsbPartitionBaseSchema = z.object({
  partPath: UsbPartitionDevPathSchema,
  fstype: UsbDriveFilesystemTypeSchema,
  label: z.string().optional(),
});

export type UsbPartitionBase = z.output<typeof UsbPartitionBaseSchema>;
