import type { Optional } from '@votingworks/basics';
import type { Election } from '@votingworks/types';

export function getMaxSheetsPerBallot(election: Election): Optional<number> {
  const sheetCounts = election.ballotStyles
    .map((ballotStyle) => ballotStyle.ballotPositions?.length)
    .filter((count): count is number => count !== undefined);
  if (sheetCounts.length === 0) {
    return undefined;
  }

  return Math.max(...sheetCounts);
}
