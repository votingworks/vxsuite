import {
  BallotPaperSize,
  CandidateContest,
  DistrictId,
  Election,
  GridLayout,
  Side,
} from '@votingworks/types';
import { Document } from './document_types';
import {
  Bubble,
  DOCUMENT_HEIGHT,
  DOCUMENT_WIDTH,
  GRID,
  range,
  TimingMarkGrid,
} from './layout';

interface AllBubbleBallotOptions {
  title: string;
  pages: number;
  fillBubble: (page: number, row: number, column: number) => boolean;
}

function createDocument({
  pages,
  fillBubble,
}: AllBubbleBallotOptions): Document {
  function Bubbles(page: number) {
    return range(1, GRID.rows - 1).flatMap((row) =>
      range(1, GRID.columns - 1).map((column) =>
        Bubble({
          row,
          column,
          isFilled: fillBubble(page, row, column),
        })
      )
    );
  }

  return {
    width: DOCUMENT_WIDTH,
    height: DOCUMENT_HEIGHT,
    pages: range(1, pages + 1).map((page) => ({
      children: [TimingMarkGrid(page), ...Bubbles(page)],
    })),
  };
}

function createElectionDefinition({
  title,
  pages,
}: AllBubbleBallotOptions): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  function candidateId(page: number, row: number, column: number) {
    return `test-candidate-page-${page}-row-${row}-column-${column}`;
  }

  const gridPositions = range(1, pages + 1).flatMap((page) =>
    range(1, GRID.rows - 1).flatMap((row) =>
      range(1, GRID.columns - 1).map((column) => ({
        page,
        row,
        column,
      }))
    )
  );
  const sheets = range(1, Math.ceil(pages / 2) + 1);
  function ballotStyleIdForSheet(sheet: number) {
    return `card-number-${sheet}`;
  }

  const contest: CandidateContest = {
    id: 'test-contest',
    type: 'candidate',
    title: 'Test Contest',
    districtId,
    candidates: gridPositions.map(({ page, row, column }) => ({
      id: candidateId(page, row, column),
      name: `Test Candidate - Page ${page}, Row ${row}, Column ${column}`,
    })),
    allowWriteIns: false,
    seats: gridPositions.length,
  };

  const gridLayouts: GridLayout[] = sheets.map((sheet) => ({
    precinctId,
    ballotStyleId: ballotStyleIdForSheet(sheet),
    columns: GRID.columns,
    rows: GRID.rows,
    optionBoundsFromTargetMark: {
      bottom: 1,
      left: 1,
      right: 1,
      top: 1,
    },
    gridPositions: (['front', 'back'] as Side[]).flatMap((side) =>
      range(1, GRID.rows - 1).flatMap((row) =>
        range(1, GRID.columns - 1).map((column) => ({
          type: 'option',
          side,
          column,
          row,
          contestId: contest.id,
          optionId: candidateId(
            sheet * 2 - (side === 'front' ? 1 : 0),
            row,
            column
          ),
        }))
      )
    ),
  }));

  return {
    ballotLayout: {
      paperSize: BallotPaperSize.Letter,
    },
    ballotStyles: sheets.map((ballotStyleId) => ({
      id: ballotStyleIdForSheet(ballotStyleId),
      districts: [districtId],
      precincts: [precinctId],
    })),
    centralScanAdjudicationReasons: [],
    contests: [contest],
    county: {
      id: 'test-county',
      name: 'Test County',
    },
    date: '2023-05-10T00:00:00Z',
    districts: [
      {
        id: districtId,
        name: 'Test District',
      },
    ],
    gridLayouts,
    markThresholds: {
      marginal: 0.05,
      definite: 0.07,
    },
    parties: [],
    precinctScanAdjudicationReasons: [],
    precincts: [
      {
        id: precinctId,
        name: 'Test Precinct',
      },
    ],
    state: 'Test State',
    title,
  };
}

function createAllBubbleBallot(options: AllBubbleBallotOptions): {
  ballotDocument: Document;
  election: Election;
} {
  return {
    ballotDocument: createDocument(options),
    election: createElectionDefinition(options),
  };
}

export const allBubbleBallots = {
  cycling: createAllBubbleBallot({
    pages: 6,
    fillBubble: (page, row, column) => (row - column - page + 1) % 6 === 0,
    title: 'Test Election - Cycling All Bubble Ballot',
  }),
  blank: createAllBubbleBallot({
    pages: 2,
    fillBubble: () => false,
    title: 'Test Election - Blank All Bubble Ballot',
  }),
  filled: createAllBubbleBallot({
    pages: 2,
    fillBubble: () => true,
    title: 'Test Election - Filled All Bubble Ballot',
  }),
} as const;
