import {
  BallotPaperSize,
  CandidateContest,
  DistrictId,
  Election,
  GridLayout,
  Side,
} from '@votingworks/types';
import { Document, GridDimensions, Rectangle } from './document_types';
import { encodeMetadata } from './encode_metadata';

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => i + start);
}

const grid: GridDimensions = {
  rows: 41,
  columns: 34,
};

interface AllBubbleBallotOptions {
  title: string;
  pages: number;
  fillBubble: (page: number, row: number, column: number) => boolean;
}

function createDocument({
  pages,
  fillBubble,
}: AllBubbleBallotOptions): Document {
  const documentWidth = 1700;
  const documentHeight = 2200;
  const columnGap = documentWidth / (grid.columns + 1);
  const rowGap = documentHeight / (grid.rows + 1);

  function TimingMark({
    row,
    column,
  }: {
    row: number;
    column: number;
  }): Rectangle {
    const markWidth = 37.5;
    const markHeight = 12.5;
    return {
      type: 'Rectangle',
      x: (column + 1) * columnGap - markWidth / 2,
      y: (row + 1) * rowGap - markHeight / 2,
      width: markWidth,
      height: markHeight,
      fill: 'black',
    };
  }

  function timingMarks(page: number) {
    // Ballot styles are `card-number-{sheetNumber}`
    const ballotStyleIndex = Math.ceil(page / 2);
    const sheetMetadata = encodeMetadata(ballotStyleIndex);
    const pageMetadata =
      page % 2 === 1
        ? sheetMetadata.frontTimingMarks
        : sheetMetadata.backTimingMarks;
    return [
      // Top
      range(0, grid.columns).map((column) =>
        TimingMark({
          row: 0,
          column,
        })
      ),
      // Bottom
      [...pageMetadata.entries()]
        .filter(([, bit]) => bit === 1)
        .map(([column]) =>
          TimingMark({
            row: grid.rows - 1,
            column,
          })
        ),
      // Left
      range(0, grid.rows).map((row) =>
        TimingMark({
          row,
          column: 0,
        })
      ),
      // Right
      range(0, grid.rows).map((row) =>
        TimingMark({ row, column: grid.columns - 1 })
      ),
    ].flat();
  }

  function Bubble({
    row,
    column,
    isFilled,
  }: {
    row: number;
    column: number;
    isFilled: boolean;
  }): Rectangle {
    const bubbleWidth = 40;
    const bubbleHeight = 26;
    return {
      type: 'Rectangle',
      x: (column + 1) * columnGap - bubbleWidth / 2,
      y: (row + 1) * rowGap - bubbleHeight / 2,
      width: bubbleWidth,
      height: bubbleHeight,
      borderRadius: 13,
      stroke: 'black',
      strokeWidth: 2,
      fill: isFilled ? 'black' : 'none',
    };
  }

  function bubbles(page: number) {
    return range(1, grid.rows - 1).flatMap((row) =>
      range(1, grid.columns - 1).map((column) =>
        Bubble({
          row,
          column,
          isFilled: fillBubble(page, row, column),
        })
      )
    );
  }

  return {
    width: documentWidth,
    height: documentHeight,
    grid,
    pages: range(1, pages + 1).map((page) => ({
      children: [...timingMarks(page), ...bubbles(page)],
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
    range(1, grid.rows - 1).flatMap((row) =>
      range(1, grid.columns - 1).map((column) => ({
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
    columns: grid.columns,
    rows: grid.rows,
    optionBoundsFromTargetMark: {
      bottom: 1,
      left: 1,
      right: 1,
      top: 1,
    },
    gridPositions: (['front', 'back'] as Side[]).flatMap((side) =>
      range(1, grid.rows - 1).flatMap((row) =>
        range(1, grid.columns - 1).map((column) => ({
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
