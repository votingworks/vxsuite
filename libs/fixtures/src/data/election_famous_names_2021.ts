import {
  ContestPosition,
  Election,
  ElectionDefinition,
  SheetPositions,
} from '@votingworks/types';
import * as builders from '../builders';
import { asElectionDefinition } from '../util';

export const electionJson = builders.election(
  'data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json'
);
export const { readElection, readElectionDefinition, toElectionPackage } =
  electionJson;

export const electionPackage = builders.file(
  'data/electionFamousNames2021/election-package-default-system-settings.zip'
);
// eslint-disable-next-line vx/gts-identifiers, camelcase
export const baseElection_DEPRECATED = builders.election(
  'data/electionFamousNames2021/electionBase.json'
);

const mockContestPosition: ContestPosition = {
  contestId: 'mayor',
  bounds: { row: 0, column: 0, width: 0, height: 0 },
  options: [
    {
      type: 'option',
      bubbleCenter: { row: 0, column: 0 },
      bounds: { row: 0, column: 0, width: 0, height: 0 },
      optionId: 'sherlock-holmes',
    },
  ],
};

// Three sheets, each with the mock contest on the front. Invalid for scanning,
// but the data structure is useful for testing multi-sheet handling.
const mockMultiSheetBallotPositions: SheetPositions[] = [
  [[mockContestPosition], []],
  [[mockContestPosition], []],
  [[mockContestPosition], []],
];

/**
 * Election with mock multi-sheet ballot positions. The positions are invalid
 * and cannot be used for scanning, but the data structure is useful for
 * testing.
 */
export function makeMultiSheetElection(): Election {
  const election = readElection();
  return {
    ...election,
    ballotStyles: election.ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      ballotPositions: mockMultiSheetBallotPositions,
    })),
  };
}

/**
 * Election definition with mock multi-sheet grid layouts. The layouts are invalid and
 * cannot be used for scanning, but the data structure is useful for testing.
 */
export function makeMultiSheetElectionDefinition(): ElectionDefinition {
  return asElectionDefinition(makeMultiSheetElection());
}
