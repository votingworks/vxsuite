import { Exporter } from '@votingworks/backend';
import { Usb } from './usb';
import { SCAN_ALLOWED_EXPORT_PATTERNS } from '../globals';

/**
 * Builds an exporter suitable for saving data to a file or USB drive.
 */
export function buildExporter(usb: Usb): Exporter {
  const exporter = new Exporter({
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
    getUsbDrives: usb.getUsbDrives,
  });
  return exporter;
}
