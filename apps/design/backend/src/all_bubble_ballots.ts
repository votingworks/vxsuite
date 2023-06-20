import {
  AdjudicationReason,
  BallotPaperSize,
  CandidateContest,
  DistrictId,
  Election,
  GridLayout,
  Side,
} from '@votingworks/types';
import {
  Bubble,
  Document,
  DOCUMENT_HEIGHT,
  DOCUMENT_WIDTH,
  GRID,
  range,
  TimingMarkGrid,
} from '@votingworks/design-shared';

interface AllBubbleBallotOptions {
  fillBubble: (page: number, row: number, column: number) => boolean;
}

function createBallotCard({ fillBubble }: AllBubbleBallotOptions): Document {
  function bubbles(page: number) {
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
    pages: [
      { children: [TimingMarkGrid({ pageNumber: 1 }), ...bubbles(1)] },
      { children: [TimingMarkGrid({ pageNumber: 2 }), ...bubbles(2)] },
    ],
  };
}

function createElection(): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  function candidateId(page: number, row: number, column: number) {
    return `test-candidate-page-${page}-row-${row}-column-${column}`;
  }

  const gridPositions = range(1, 3).flatMap((page) =>
    range(1, GRID.rows - 1).flatMap((row) =>
      range(1, GRID.columns - 1).map((column) => ({
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
      columns: GRID.columns,
      rows: GRID.rows,
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 1,
        top: 1,
      },
      gridPositions: (['front', 'back'] as Side[]).flatMap((side) => {
        const page = side === 'front' ? 1 : 2;
        return range(1, GRID.rows - 1).flatMap((row) =>
          range(1, GRID.columns - 1).map((column) => ({
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

export const allBubbleBallotElection = createElection();
export const allBubbleBallotBlankBallot = createBallotCard({
  fillBubble: () => false,
});
export const allBubbleBallotFilledBallot = createBallotCard({
  fillBubble: () => true,
});
export const allBubbleBallotCyclingTestDeck: Document = {
  width: DOCUMENT_WIDTH,
  height: DOCUMENT_HEIGHT,
  pages: range(0, 6).flatMap(
    (card) =>
      createBallotCard({
        fillBubble: (_page, row, column) => (row - column - card) % 6 === 0,
      }).pages
  ),
};
