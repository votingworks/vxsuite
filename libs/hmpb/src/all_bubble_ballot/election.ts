import { assert, assertDefined, DateWithoutTime } from '@votingworks/basics';
import type {
  BallotStyleGroupId,
  BallotStyleId,
  CandidateContest,
  ContestPosition,
  DistrictId,
  Election,
  GridRect,
  OptionPosition,
} from '@votingworks/types';
import type { AllBubbleBallotConfig } from './config.js';

export function contestId(page: number): string {
  return `test-contest-page-${page}`;
}

export function candidateId(page: number, row: number, column: number): string {
  return `test-candidate-page-${page}-row-${row}-column-${column}`;
}

export function createElection(config: AllBubbleBallotConfig): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  const positions = allBubbleBallotPositions(config).flat();
  const ballotStyleId = 'sheet-1' as BallotStyleId;
  const ballotStyleGroupId = 'sheet-1' as BallotStyleGroupId;

  const contests: CandidateContest[] = positions.map((pagePositions, i) => {
    assert(pagePositions.length === 1, 'expected one contest per page');
    const contestPositions = assertDefined(pagePositions[0]);

    const page = i + 1;
    return {
      id: contestPositions.contestId,
      type: 'candidate',
      title: `Test Contest - Page ${page}`,
      districtId,
      candidates: contestPositions.options.map((o) => ({
        id: o.optionId,
        name: `Page ${page}, Row ${o.bubbleCenter.row}, Column ${o.bubbleCenter.column}`,
      })),
      allowWriteIns: false,
      seats: contestPositions.options.length,
    };
  });

  return {
    id: 'all-bubble-ballot-election',
    ballotLayout: {
      paperSize: config.ballotPaperSize,
      metadataEncoding: 'qr-code',
    },
    ballotStyles: [
      {
        id: ballotStyleId,
        groupId: ballotStyleGroupId,
        districts: [districtId],
        precincts: [precinctId],
        languages: ['en'],
      },
    ],
    contests,
    jurisdiction: {
      id: 'test-county',
      name: 'Test County',
    },
    date: new DateWithoutTime('2023-05-10'),
    districts: [
      {
        id: districtId,
        name: 'Test District',
      },
    ],
    parties: [],
    precincts: [
      {
        id: precinctId,
        name: 'Test Precinct',
        districtIds: [districtId],
      },
    ],
    pollingPlaces: [
      {
        id: 'polling-place-1',
        name: 'Test Precinct',
        precincts: { [precinctId]: { type: 'whole' } },
        type: 'election_day',
      },
    ],
    state: 'Test State',
    title: 'Test Election - All Bubble Ballot',
    type: 'general',
    seal: '',
    ballotStrings: {},
  };
}

type NonWriteInContestPosition = Omit<ContestPosition, 'options'> & {
  readonly options: readonly OptionPosition[];
};

type NonWriteInSheetPositions = readonly [
  front: readonly NonWriteInContestPosition[],
  back: readonly NonWriteInContestPosition[],
];

export function allBubbleBallotPositions(
  config: AllBubbleBallotConfig
): NonWriteInSheetPositions[] {
  const lastCol = config.gridColumns - 2;
  const lastRow = config.gridRows - config.footerRowHeight - 2;

  const contestBounds: GridRect = {
    column: 1,
    row: 1,
    width: lastCol - 1,
    height: lastRow - 1,
  };

  function positionsForPage(page: 1 | 2): NonWriteInContestPosition {
    const options: OptionPosition[] = [];

    for (let row = 1; row <= lastRow; row += 1) {
      for (let column = 1; column <= lastCol; column += 1) {
        options.push({
          bubbleCenter: { column, row },
          bounds: { column, row, height: 0, width: 0 },
          optionId: candidateId(page, row, column),
          type: 'option',
        });
      }
    }

    return { bounds: contestBounds, contestId: contestId(page), options };
  }

  return [[[positionsForPage(1)], [positionsForPage(2)]]];
}
