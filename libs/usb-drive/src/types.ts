import { LoggingUserRole } from '@votingworks/logging';

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
  eject(loggingUserRole: LoggingUserRole): Promise<void>;
  format(loggingUserRole: LoggingUserRole): Promise<void>;
}
