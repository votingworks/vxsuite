import { UsbDrive, UsbDriveStatus } from './hooks/use_usb_drive';

export function mockUsbDrive(status: UsbDriveStatus = 'absent'): UsbDrive {
  return {
    status,
    eject: jest.fn(),
    format: jest.fn(),
  };
}
