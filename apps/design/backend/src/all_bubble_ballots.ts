import {
  AdjudicationReason,
  BallotPaperSize,
  CandidateContest,
  DistrictId,
  Election,
  ElectionDefinition,
  GridLayout,
} from '@votingworks/types';
import {
  Bubble,
  Document,
  Footer,
  measurements,
  range,
  TimingMarkGrid,
} from '@votingworks/design-shared';
import { sha256 } from 'js-sha256';

const m = measurements(BallotPaperSize.Letter, 0);
const { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, GRID } = m;

function createElection(): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  function candidateId(page: number, row: number, column: number) {
    return `test-candidate-page-${page}-row-${row}-column-${column}`;
  }

  const gridPositions = range(1, 3).flatMap((page) =>
    range(1, GRID.rows - m.FOOTER_ROW_HEIGHT - 1).flatMap((row) =>
      range(1, GRID.columns - 1).map((column) => ({
        page,
        row,
        column,
      }))
    )
  );
  const ballotStyleId = 'sheet-1';

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
      gridPositions: gridPositions.map(({ page, row, column }) => ({
        type: 'option',
        side: page % 2 === 1 ? 'front' : 'back',
        column,
        row,
        contestId: contests[page - 1].id,
        optionId: candidateId(page, row, column),
      })),
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
const electionData = JSON.stringify(allBubbleBallotElection);
export const allBubbleBallotElectionDefinition: ElectionDefinition = {
  electionData,
  election: allBubbleBallotElection,
  electionHash: sha256(electionData),
};

interface AllBubbleBallotOptions {
  fillBubble: (page: number, row: number, column: number) => boolean;
}

function createBallotCard({ fillBubble }: AllBubbleBallotOptions): Document {
  function bubbles(page: number) {
    return range(2, GRID.rows - m.FOOTER_ROW_HEIGHT).flatMap((row) =>
      range(2, GRID.columns).map((column) =>
        Bubble({
          row,
          column,
          isFilled: fillBubble(page, row, column),
          m,
        })
      )
    );
  }

  return {
    width: DOCUMENT_WIDTH,
    height: DOCUMENT_HEIGHT,
    pages: [
      {
        children: [
          TimingMarkGrid({ m }),
          ...bubbles(1),
          Footer({
            electionDefinition: allBubbleBallotElectionDefinition,
            ballotStyle: allBubbleBallotElection.ballotStyles[0],
            precinct: allBubbleBallotElection.precincts[0],
            isTestMode: true,
            pageNumber: 1,
            totalPages: 2,
            m,
          }),
        ],
      },
      {
        children: [
          TimingMarkGrid({ m }),
          ...bubbles(2),
          Footer({
            electionDefinition: allBubbleBallotElectionDefinition,
            ballotStyle: allBubbleBallotElection.ballotStyles[0],
            precinct: allBubbleBallotElection.precincts[0],
            isTestMode: true,
            pageNumber: 2,
            totalPages: 2,
            m,
          }),
        ],
      },
    ],
  };
}

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
