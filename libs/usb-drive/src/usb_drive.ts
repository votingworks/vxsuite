import { Logger } from '@votingworks/logging';
import { getEnvUsbPlatform } from './get_env_usb_platform';
import { detectMultiUsbDrive } from './multi_usb_drive';
import { UsbDrive } from './types';
import { createUsbDriveAdapter } from './usb_drive_adapter';
import { UsbPlatform } from './usb_platform_types';

// @coverage-exclude
export function detectUsbDriveFromEnv(options: { logger: Logger }): UsbDrive {
  return detectUsbDrive({
    logger: options.logger,
    platform: getEnvUsbPlatform(),
  });
}

export function detectUsbDrive(options: {
  logger: Logger;
  platform: UsbPlatform;
}): UsbDrive {
  const multiUsbDrive = detectMultiUsbDrive(options);
  return createUsbDriveAdapter(
    multiUsbDrive,
    (drives) => drives.find((d) => d.partition?.fstype === 'fat32')?.diskPath
  );
}
