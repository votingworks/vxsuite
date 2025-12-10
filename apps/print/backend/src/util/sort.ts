import { BallotPrintCount } from '@votingworks/types';
import { languageSort } from '@votingworks/utils';

// sortBallotPrintCounts sort order: totalCount, precinctOrSplitName, partyName, languageCode
export function sortBallotPrintCounts(
  ballotPrintCountA: BallotPrintCount,
  ballotPrintCountB: BallotPrintCount
): number {
  if (ballotPrintCountA.totalCount !== ballotPrintCountB.totalCount) {
    return ballotPrintCountB.totalCount - ballotPrintCountA.totalCount;
  }

  if (
    ballotPrintCountA.precinctOrSplitName !==
    ballotPrintCountB.precinctOrSplitName
  ) {
    return ballotPrintCountA.precinctOrSplitName.localeCompare(
      ballotPrintCountB.precinctOrSplitName
    );
  }

  if (ballotPrintCountA.partyName && ballotPrintCountB.partyName) {
    if (ballotPrintCountA.partyName !== ballotPrintCountB.partyName) {
      return ballotPrintCountA.partyName.localeCompare(
        ballotPrintCountB.partyName
      );
    }
  }

  return languageSort(
    ballotPrintCountA.languageCode,
    ballotPrintCountB.languageCode
  );
}
