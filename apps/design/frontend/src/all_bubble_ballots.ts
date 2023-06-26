import {
  AdjudicationReason,
  BallotPaperSize,
  CandidateContest,
  DistrictId,
  Election,
  GridLayout,
  Side,
} from '@votingworks/types';
import { Document, GridDimensions, Page, Rectangle } from './document_types';
import { encodeMetadata } from './encode_metadata';

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => i + start);
}

const grid: GridDimensions = {
  rows: 41,
  columns: 34,
};

const documentWidth = 1700;
const documentHeight = 2200;

interface AllBubbleBallotOptions {
  fillBubble: (page: number, row: number, column: number) => boolean;
}

function createBallotCard({
  fillBubble,
}: AllBubbleBallotOptions): [Page, Page] {
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

  return [
    { children: [...timingMarks(1), ...bubbles(1)] },
    { children: [...timingMarks(2), ...bubbles(2)] },
  ];
}

function createElection(): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  function candidateId(page: number, row: number, column: number) {
    return `test-candidate-page-${page}-row-${row}-column-${column}`;
  }

  const gridPositions = range(1, 3).flatMap((page) =>
    range(1, grid.rows - 1).flatMap((row) =>
      range(1, grid.columns - 1).map((column) => ({
        page,
        row,
        column,
      }))
    )
  );
  const ballotStyleId = 'card-number-1';

  const contests: CandidateContest[] = range(1, 3).map((page) => {
    const pageGridPositions = gridPositions.filter(
      (position) => position.page === page
    );
    return {
      id: `test-contest-page-${page}`,
      type: 'candidate',
      title: `Test Contest - Page ${page}`,
      districtId,
      candidates: pageGridPositions.map(({ row, column }) => ({
        id: candidateId(page, row, column),
        name: `Page ${page}, Row ${row}, Column ${column}`,
      })),
      allowWriteIns: false,
      seats: pageGridPositions.length,
    };
  });

  const gridLayouts: GridLayout[] = [
    {
      precinctId,
      ballotStyleId,
      columns: grid.columns,
      rows: grid.rows,
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 1,
        top: 1,
      },
      gridPositions: (['front', 'back'] as Side[]).flatMap((side) => {
        const page = side === 'front' ? 1 : 2;
        return range(1, grid.rows - 1).flatMap((row) =>
          range(1, grid.columns - 1).map((column) => ({
            type: 'option',
            side,
            column,
            row,
            contestId: contests[page - 1].id,
            optionId: candidateId(page, row, column),
          }))
        );
      }),
    },
  ];

  return {
    ballotLayout: {
      paperSize: BallotPaperSize.Letter,
    },
    ballotStyles: [
      {
        id: ballotStyleId,
        districts: [districtId],
        precincts: [precinctId],
      },
    ],
    centralScanAdjudicationReasons: [AdjudicationReason.Overvote],
    precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
    contests,
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
    precincts: [
      {
        id: precinctId,
        name: 'Test Precinct',
      },
    ],
    state: 'Test State',
    title: 'Test Election - All Bubble Ballot',
    sealUrl: '/seals/state-of-hamilton-official-seal.svg',
  };
}

function createTestDeck(): Document {
  const blankBallotCard = createBallotCard({
    fillBubble: () => false,
  });
  const filledBallotCard = createBallotCard({
    fillBubble: () => true,
  });
  const cyclingBallotCards = range(0, 6).map((card) =>
    createBallotCard({
      fillBubble: (_page, row, column) => (row - column - card) % 6 === 0,
    })
  );
  return {
    width: documentWidth,
    height: documentHeight,
    grid,
    pages: [
      ...blankBallotCard,
      ...filledBallotCard,
      ...cyclingBallotCards.flat(),
    ],
  };
}

export const allBubbleBallotElection = createElection();
export const allBubbleBallotTestDeck = createTestDeck();
