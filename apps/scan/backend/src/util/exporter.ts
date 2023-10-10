import { Exporter } from '@votingworks/backend';
import { UsbDrive } from '@votingworks/usb-drive';
import { SCAN_ALLOWED_EXPORT_PATTERNS } from '../globals';

/**
 * Builds an exporter suitable for saving data to a file or USB drive.
 */
export function buildExporter(usbDrive: UsbDrive): Exporter {
  const exporter = new Exporter({
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
    usbDrive,
  });
  return exporter;
}
