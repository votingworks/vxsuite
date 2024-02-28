import { SheetOf } from '@votingworks/types';
import { join } from 'path';

export function getBlankSheetFixturePath(): string {
  return join(__dirname, 'fixtures', 'blank-sheet.jpg');
}

export function getSampleBallotFilepaths(): SheetOf<string> {
  return [
    join(
      __dirname,
      'fixtures',
      'bmd-ballot-general-north-springfield-style-5.jpg'
    ),
    getBlankSheetFixturePath(),
  ];
}
