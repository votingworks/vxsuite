import { Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { createMockFileUsbDrive } from './mocks/file_usb_drive';
import { detectMultiUsbDrive } from './multi_usb_drive';
import { UsbDrive } from './types';
import { createUsbDriveAdapter } from './usb_drive_adapter';

export function detectUsbDrive(logger: Logger): UsbDrive {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return createMockFileUsbDrive();
  }
  const multiUsbDrive = detectMultiUsbDrive(logger);
  return createUsbDriveAdapter(
    multiUsbDrive,
    (drives) => drives.find((d) => d.partition?.fstype === 'fat32')?.diskPath
  );
}
