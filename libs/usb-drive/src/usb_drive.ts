import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { UsbDrive } from './types';
import {
  createMockFileMultiUsbDrive,
  MockFileUsbDrive,
} from './mocks/file_usb_drive';
import { detectMultiUsbDrive, MultiUsbDrive } from './multi_usb_drive';
import { createUsbDriveAdapter } from './usb_drive_adapter';

export function detectOrMockMultiUsbDrive(logger: Logger): MultiUsbDrive {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return createMockFileMultiUsbDrive();
  }
  return detectMultiUsbDrive(logger);
}

export function detectUsbDrive(
  logger: Logger,
  options: { onChange?: () => void } = {}
): UsbDrive {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return new MockFileUsbDrive();
  }
  const multiUsbDrive = detectMultiUsbDrive(logger, {
    onChange: options.onChange,
  });
  return createUsbDriveAdapter(multiUsbDrive, (drives) => drives[0]?.devPath);
}
