import { Exporter } from '@votingworks/backend';
import { UsbDrive } from '@votingworks/usb-drive';
import { getAdminAllowedExportPatterns } from '../globals.js';

/**
 * Builds an exporter suitable for saving data to a file or USB drive.
 */
export function buildExporter(usbDrive: UsbDrive): Exporter {
  const exporter = new Exporter({
    allowedExportPatterns: getAdminAllowedExportPatterns(),
    usbDrive,
  });
  return exporter;
}
