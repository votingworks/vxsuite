import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  GridLayout,
} from '@votingworks/types';
import * as builders from '../builders';
import { asElectionDefinition } from '../util';

export const electionJson = builders.election(
  'data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json'
);
export const { readElection, readElectionDefinition } = electionJson;

export const electionPackage = builders.file(
  'data/electionFamousNames2021/election-package-default-system-settings.zip'
);
// eslint-disable-next-line vx/gts-identifiers, camelcase
export const baseElection_DEPRECATED = builders.election(
  'data/electionFamousNames2021/electionBase.json'
);

const partialMockGridPosition = {
  type: 'option',
  side: 'front',
  column: 0,
  row: 0,
  contestId: 'mayor',
  optionId: 'sherlock-holmes',
} as const;

const mockMultiSheetGridLayouts: GridLayout[] = [
  {
    ballotStyleId: '1' as BallotStyleId,
    optionBoundsFromTargetMark: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    gridPositions: [
      {
        ...partialMockGridPosition,
        sheetNumber: 1,
      },
      {
        ...partialMockGridPosition,
        sheetNumber: 2,
      },
      {
        ...partialMockGridPosition,
        sheetNumber: 3,
      },
    ],
  },
];

/**
 * Election with mock multi-sheet grid layouts. The layouts are invalid and
 * cannot be used for scanning, but the data structure is useful for testing.
 */
export function makeMultiSheetElection(): Election {
  const election = readElection();
  return { ...election, gridLayouts: mockMultiSheetGridLayouts };
}

/**
 * Election definition with mock multi-sheet grid layouts. The layouts are invalid and
 * cannot be used for scanning, but the data structure is useful for testing.
 */
export function makeMultiSheetElectionDefinition(): ElectionDefinition {
  return asElectionDefinition(makeMultiSheetElection());
}
