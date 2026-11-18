import { expect, test } from 'vitest';
import { sanitizeFilenameForUsbDrive } from './filenames.js';

test('sanitizeFilenameForUsbDrive replaces separators and invalid characters', () => {
  expect(
    sanitizeFilenameForUsbDrive(
      'PROOF-official-precinct-ballot-North/South\\Ward:1*?"<>|-1_en.pdf'
    )
  ).toEqual('PROOF-official-precinct-ballot-North_South_Ward_1______-1_en.pdf');
  expect(sanitizeFilenameForUsbDrive('Center_Springfield-1_en.pdf')).toEqual(
    'Center_Springfield-1_en.pdf'
  );
});
