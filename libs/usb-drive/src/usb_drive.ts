import { Logger } from '@votingworks/logging';
import { detectMultiUsbDrive } from './multi_usb_drive';
import { UsbDrive } from './types';
import { createUsbDriveAdapter } from './usb_drive_adapter';
import { UsbPlatform } from './usb_platform';

export function detectUsbDrive(
  logger: Logger,
  options?: { platform?: UsbPlatform }
): UsbDrive {
  const multiUsbDrive = detectMultiUsbDrive(logger, options);
  return createUsbDriveAdapter(
    multiUsbDrive,
    (drives) => drives.find((d) => d.partition?.fstype === 'fat32')?.diskPath
  );
}
