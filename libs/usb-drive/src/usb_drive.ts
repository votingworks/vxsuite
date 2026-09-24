import { Logger } from '@votingworks/logging';
import { getEnvUsbPlatform } from './get_env_usb_platform.js';
import { detectMultiUsbDrive } from './multi_usb_drive.js';
import {
  getUsbDrivePurpose,
  UsbDiskDevPath,
  UsbDrive,
  UsbDriveInfo,
  UsbDrivePurpose,
} from './types.js';
import { createUsbDriveAdapter } from './usb_drive_adapter.js';
import { UsbPlatform } from './usb_platform_types.js';

/** Returns the first drive whose partition serves `purpose`, if any. */
export function findDriveByPurpose(
  drives: readonly UsbDriveInfo[],
  purpose: UsbDrivePurpose
): UsbDiskDevPath | undefined {
  return drives.find(
    (d) => d.partition && getUsbDrivePurpose(d.partition.fstype) === purpose
  )?.diskPath;
}

// @coverage-exclude
export function detectUsbDriveFromEnv(options: { logger: Logger }): UsbDrive {
  return detectUsbDrive({
    logger: options.logger,
    platform: getEnvUsbPlatform(),
  });
}

/**
 * Provides a basic interface to the first data drive found.
 */
export function detectUsbDrive(options: {
  logger: Logger;
  platform: UsbPlatform;
}): UsbDrive {
  const multiUsbDrive = detectMultiUsbDrive(options);
  return createUsbDriveAdapter(multiUsbDrive, (drives) =>
    findDriveByPurpose(drives, 'data')
  );
}
