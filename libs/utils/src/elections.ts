import { Optional } from '@votingworks/basics';
import { Election } from '@votingworks/types';

/**
 * Whether the election carries HMPB ballot geometry, i.e. at least one ballot
 * style has `ballotPositions`. The v4.1+ replacement for checking
 * `election.gridLayouts`.
 */
export function electionHasBallotPositions(election: Election): boolean {
  return election.ballotStyles.some(
    (ballotStyle) => ballotStyle.ballotPositions !== undefined
  );
}

export function getMaxSheetsPerBallot(election: Election): Optional<number> {
  const sheetCounts = election.ballotStyles
    .map((ballotStyle) => ballotStyle.ballotPositions?.length)
    .filter((count): count is number => count !== undefined);
  if (sheetCounts.length === 0) {
    return undefined;
  }

  return Math.max(...sheetCounts);
}
