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
