import { Result } from '@votingworks/basics';

export interface MountedUsbDriveStatus {
  status: 'mounted';
  mountPoint: string;
}

export type UnmountedUsbDriveStatus =
  | { status: 'no_drive' }
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format' };

export type UsbDriveStatus = MountedUsbDriveStatus | UnmountedUsbDriveStatus;

export interface UsbDrive {
  mounted(): Promise<Result<MountedUsbDrive, UnmountedUsbDriveStatus>>;
  status(): Promise<UsbDriveStatus>;
  eject(): Promise<void>;
  format(): Promise<void>;
  sync(): Promise<void>;
}

export interface MountedUsbDrive {
  mountPoint: string;
  sync(): Promise<void>;
}
