import { Logger } from '@votingworks/logging';
import { getEnvUsbPlatform } from './get_env_usb_platform.js';
import { detectMultiUsbDrive } from './multi_usb_drive.js';
import { UsbDrive } from './types.js';
import { createUsbDriveAdapter } from './usb_drive_adapter.js';
import { UsbPlatform } from './usb_platform_types.js';

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
