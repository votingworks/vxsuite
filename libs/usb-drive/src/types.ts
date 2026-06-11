import { type UsbDriveFilesystemType } from './multi_usb_drive';

export type UsbDriveStatus =
  | { status: 'no_drive' }
  | {
      status: 'mounted';
      mountPoint: string;
    }
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format' };

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
  diskPath: string;
  partition?: UsbPartitionInfo;
}

/**
 * A USB partition with one of the supported file systems.
 */
export interface UsbPartitionInfo {
  diskPath: string;
  partPath: string;
  fstype: UsbDriveFilesystemType;
  mount: UsbPartitionMount;
  label?: string;
}

export const UsbPartitionMount = {
  unmounted: (): UsbPartitionMount => ({ type: 'unmounted', isMounted: false }),
  ejected: (): UsbPartitionMount => ({ type: 'ejected', isMounted: false }),
  mounting: (): UsbPartitionMount => ({ type: 'mounting', isMounted: false }),
  mounted: (mountPoint: string): UsbPartitionMount => ({
    type: 'mounted',
    isMounted: true,
    mountPoint,
  }),
  unmounting: (mountPoint: string): UsbPartitionMount => ({
    type: 'unmounting',
    isMounted: true,
    mountPoint,
  }),
} as const;

export type UsbPartitionMount =
  | { type: 'unmounted'; isMounted: false }
  | { type: 'ejected'; isMounted: false }
  | { type: 'mounting'; isMounted: false }
  | { type: 'mounted'; isMounted: true; mountPoint: string }
  | { type: 'unmounting'; isMounted: true; mountPoint: string };
