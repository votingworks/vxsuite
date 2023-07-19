import { ExportDataResult, Exporter } from '@votingworks/backend';
import { ADMIN_ALLOWED_EXPORT_PATTERNS } from '../globals';
import { rootDebug } from './debug';

const debug = rootDebug.extend('export-file');

/**
 * Save a file to disk.
 */
export function exportFile({
  path,
  data,
}: {
  path: string;
  data: string | NodeJS.ReadableStream;
}): Promise<ExportDataResult> {
  const exporter = new Exporter({
    allowedExportPatterns: ADMIN_ALLOWED_EXPORT_PATTERNS,
    /* we're not using `exportDataToUsbDrive`, so a placeholder `getUsbDrives` is fine */
    /* c8 ignore next */
    getUsbDrives: () => Promise.resolve([]),
  });

  debug('exporting data to file %s', path);
  return exporter.exportData(path, data);
}
