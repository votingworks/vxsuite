import {
  ExportDataResult,
  ExportableData,
  Exporter,
} from '@votingworks/backend';
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
  data: ExportableData;
}): Promise<ExportDataResult> {
  const exporter = new Exporter({
    allowedExportPatterns: ADMIN_ALLOWED_EXPORT_PATTERNS,
    /* We're not using `exportDataToUsbDrive` here, so a mock `usbDrive` is OK */
    /* c8 ignore start */
    usbDrive: {
      status: () =>
        Promise.resolve({
          status: 'no_drive',
        }),
      eject: () => Promise.resolve(),
      format: () => Promise.resolve(),
    },
    /* c8 ignore stop */
  });

  debug('exporting data to file %s', path);
  return exporter.exportData(path, data);
}
