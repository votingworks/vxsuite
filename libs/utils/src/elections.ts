import { Optional, unique } from '@votingworks/basics';
import { Election } from '@votingworks/types';

export function getElectionSheetCount(election: Election): Optional<number> {
  if (!election.gridLayouts) {
    return undefined;
  }

  return unique(
    election.gridLayouts
      .flatMap((gridLayout) => gridLayout.gridPositions)
      .map(({ sheetNumber }) => sheetNumber)
  ).length;
}
