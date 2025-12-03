import { LanguageCode } from '@votingworks/types';
import { BallotPrintCount } from '../types';

function sortLanguages(
  languageA: LanguageCode,
  languageB: LanguageCode
): number {
  const languageOrder: LanguageCode[] = [
    LanguageCode.ENGLISH,
    LanguageCode.SPANISH,
    LanguageCode.CHINESE_SIMPLIFIED,
    LanguageCode.CHINESE_TRADITIONAL,
  ];
  const indexA = languageOrder.indexOf(languageA);
  const indexB = languageOrder.indexOf(languageB);
  return indexA - indexB;
}

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

  return sortLanguages(
    ballotPrintCountA.languageCode,
    ballotPrintCountB.languageCode
  );
}
