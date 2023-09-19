import { UsbDrive, UsbDriveStatus } from './usb_drive';

/**
 * TODO: Implement properly to enable USB drive operations in integration tests.
 */
export class MockFileUsbDrive implements UsbDrive {
  status(): Promise<UsbDriveStatus> {
    return Promise.resolve({ status: 'no_drive' });
  }

  eject(): Promise<void> {
    return Promise.resolve();
  }

  format(): Promise<void> {
    return Promise.resolve();
  }
}
