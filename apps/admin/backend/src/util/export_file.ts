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
    usbDrive: {
      status:
        /* istanbul ignore next */
        () =>
          Promise.resolve({
            status: 'no_drive',
          }),

      eject:
        /* istanbul ignore next */
        () => Promise.resolve(),
      format:
        /* istanbul ignore next */
        () => Promise.resolve(),
      sync:
        /* istanbul ignore next */
        () => Promise.resolve(),
    },
  });

  debug('exporting data to file %s', path);
  return exporter.exportData(path, data);
}
