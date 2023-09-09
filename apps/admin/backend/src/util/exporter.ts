import {
  Exporter,
  UsbDrive as DeprecatedUsbDriveType,
} from '@votingworks/backend';
import { UsbDrive } from '@votingworks/usb-drive';
import { ADMIN_ALLOWED_EXPORT_PATTERNS } from '../globals';

/**
 * TODO: Convert Exporter to use libs/usb-drive types.
 *
 * Wraps the libs/usb-drive interface in a `getUsbDrives` function
 * which is the pattern currently expected the libs/backend.
 */
export function getGetUsbDrives(
  usbDrive: UsbDrive
): () => Promise<DeprecatedUsbDriveType[]> {
  return async () => {
    const drive = await usbDrive.status();
    return drive.status === 'mounted' ? [drive] : [];
  };
}

/**
 * Builds an exporter suitable for saving data to a file or USB drive.
 */
export function buildExporter(usbDrive: UsbDrive): Exporter {
  const exporter = new Exporter({
    allowedExportPatterns: ADMIN_ALLOWED_EXPORT_PATTERNS,
    // TODO Convert Exporter to use libs/usb-drive types
    getUsbDrives: getGetUsbDrives(usbDrive),
  });
  return exporter;
}
