import { expect, test } from 'vitest';
import { ExportDataError } from '@votingworks/types';
import { userReadableMessageFromExportDataError } from './export_data_error.js';

test.each<[ExportDataError, string]>([
  ['file-system-error', 'Unable to write to USB drive.'],
  ['permission-denied', 'Unable to write to USB drive.'],
  ['missing-usb-drive', 'No USB drive detected.'],
  ['file-too-large', 'File is too large for the USB drive format.'],
  ['insufficient-space', 'Not enough space on the USB drive.'],
  ['relative-file-path', 'Invalid file path.'],
])('%s', (type, message) => {
  expect(userReadableMessageFromExportDataError(type)).toEqual(message);
});
