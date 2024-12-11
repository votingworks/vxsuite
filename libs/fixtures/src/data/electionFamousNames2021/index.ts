import { BallotStyleId, Election, GridLayout } from '@votingworks/types';
import { election } from './electionGeneratedWithGridLayoutsEnglishOnly.json';
import { asElectionDefinition } from '../../util';

export {
  election,
  electionDefinition,
} from './electionGeneratedWithGridLayoutsEnglishOnly.json';
export * as electionJson from './electionGeneratedWithGridLayoutsEnglishOnly.json';

export * as electionPackage from './election-package-default-system-settings.zip';
// eslint-disable-next-line vx/gts-identifiers, camelcase
export * as baseElection_DEPRECATED from './electionBase.json';

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
export const multiSheetElection: Election = {
  ...election,
  gridLayouts: mockMultiSheetGridLayouts,
};

/**
 * Election definition with mock multi-sheet grid layouts. The layouts are invalid and
 * cannot be used for scanning, but the data structure is useful for testing.
 */
export const multiSheetElectionDefinition =
  asElectionDefinition(multiSheetElection);
