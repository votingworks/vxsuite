import { Exporter } from '@votingworks/data';
import { SCAN_ALLOWED_EXPORT_PATTERNS } from '../globals';

/**
 * Builds an exporter suitable for saving data to a file or USB drive.
 */
export function buildExporter(): Exporter {
  const exporter = new Exporter({
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
  });
  return exporter;
}
