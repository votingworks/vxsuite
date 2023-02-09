import { UsbDrive, UsbDriveStatus } from '@votingworks/ui';

export function mockUsbDrive(status: UsbDriveStatus = 'absent'): UsbDrive {
  return {
    status,
    eject: jest.fn(),
    format: jest.fn(),
  };
}
