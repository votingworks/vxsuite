import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from './types';
import { createMockFileUsbDrive } from './mocks/file_usb_drive';
import { detectMultiUsbDrive, isFat32Partition } from './multi_usb_drive';
import { createUsbDriveAdapter } from './usb_drive_adapter';
import { UsbPlatform } from './usb_platform';

export interface UsbDriveOptions {
  platform?: UsbPlatform;
}

export function detectUsbDrive(
  logger: Logger,
  options?: UsbDriveOptions
): UsbDrive {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return createMockFileUsbDrive();
  }
  const multiUsbDrive = detectMultiUsbDrive(logger, options);
  return createUsbDriveAdapter(
    multiUsbDrive,
    (drives) => drives.find((d) => isFat32Partition(d.partitions[0]))?.devPath
  );
}
