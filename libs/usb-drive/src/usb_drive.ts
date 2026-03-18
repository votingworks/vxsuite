import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from './types';
import { MockFileUsbDrive } from './mocks/file_usb_drive';
import { detectMultiUsbDrive } from './multi_usb_drive';
import { createUsbDriveAdapter } from './usb_drive_adapter';

export function detectUsbDrive(
  logger: Logger,
  onRefresh?: () => void
): UsbDrive {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return new MockFileUsbDrive();
  }
  const multiUsbDrive = detectMultiUsbDrive(logger, { onChange: onRefresh });
  return createUsbDriveAdapter(multiUsbDrive, (drives) => drives[0]?.devPath);
}
