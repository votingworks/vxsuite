import { combinePageInterpretationsForSheet } from '@votingworks/ballot-interpreter';
import { Election, PageInterpretation, SheetOf } from '@votingworks/types';

export function sheetRequiresAdjudication(
  pages: SheetOf<PageInterpretation>,
  election: Election
): boolean {
  return (
    combinePageInterpretationsForSheet(pages, election).type !== 'ValidSheet'
  );
}
