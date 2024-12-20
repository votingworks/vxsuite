import { Optional } from '@votingworks/basics';
import { Election } from '@votingworks/types';

export function getMaxSheetsPerBallot(election: Election): Optional<number> {
  if (!election.gridLayouts) {
    return undefined;
  }

  return Math.max(
    ...election.gridLayouts
      .flatMap((gridLayout) => gridLayout.gridPositions)
      .map(({ sheetNumber }) => sheetNumber)
  );
}
