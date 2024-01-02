import {
  BallotPaperSize,
  BallotType,
  CandidateContest,
  DistrictId,
  Election,
  ElectionDefinition,
  GridLayout,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  OptionBubble,
  Document,
  Footer,
  measurements,
  TimingMarkGrid,
} from '@votingworks/hmpb-layout';
import { range } from '@votingworks/basics';
import { join } from 'path';
import { fixturesDir } from './ballot_fixtures';

export const allBubbleBallotDir = join(fixturesDir, 'all-bubble-ballot');

const m = measurements(BallotPaperSize.Letter, 0);
const { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, GRID } = m;

function contestId(page: number) {
  return `test-contest-page-${page}`;
}

function candidateId(page: number, row: number, column: number) {
  return `test-candidate-page-${page}-row-${row}-column-${column}`;
}

function createElection(): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

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
      id: contestId(page),
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
      ballotStyleId,
      optionBoundsFromTargetMark: {
        bottom: 1,
        left: 1,
        right: 1,
        top: 1,
      },
      gridPositions: gridPositions.map(({ page, row, column }) => ({
        type: 'option',
        sheetNumber: Math.ceil(page / 2),
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
      metadataEncoding: 'qr-code',
    },
    ballotStyles: [
      {
        id: ballotStyleId,
        districts: [districtId],
        precincts: [precinctId],
      },
    ],
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
    parties: [],
    precincts: [
      {
        id: precinctId,
        name: 'Test Precinct',
      },
    ],
    state: 'Test State',
    title: 'Test Election - All Bubble Ballot',
    type: 'general',
    seal: '',
  };
}

const election = createElection();
const electionData = JSON.stringify(election, null, 2);
const electionDefinition: ElectionDefinition =
  safeParseElectionDefinition(electionData).unsafeUnwrap();

interface AllBubbleBallotOptions {
  fillBubble: (page: number, row: number, column: number) => boolean;
}

function createBallotCard({ fillBubble }: AllBubbleBallotOptions): Document {
  function bubbles(page: number) {
    return range(2, GRID.rows - m.FOOTER_ROW_HEIGHT).flatMap((row) =>
      range(2, GRID.columns).map((column) =>
        OptionBubble({
          row,
          column,
          isFilled: fillBubble(page, row, column),
          gridPosition: {
            type: 'option',
            contestId: contestId(page),
            optionId: candidateId(page, row, column),
            row,
            column,
            sheetNumber: Math.ceil(page / 2),
            side: page % 2 === 1 ? 'front' : 'back',
          },
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
            election,
            ballotStyle: election.ballotStyles[0],
            precinct: election.precincts[0],
            pageNumber: 1,
            totalPages: 2,
            ballotType: BallotType.Precinct,
            ballotMode: 'test',
            electionHash: electionDefinition.electionHash,
            m,
          }),
        ],
      },
      {
        children: [
          TimingMarkGrid({ m }),
          ...bubbles(2),
          Footer({
            election,
            ballotStyle: election.ballotStyles[0],
            precinct: election.precincts[0],
            pageNumber: 2,
            totalPages: 2,
            ballotType: BallotType.Precinct,
            ballotMode: 'test',
            electionHash: electionDefinition.electionHash,
            m,
          }),
        ],
      },
    ],
  };
}

const blankBallot = createBallotCard({
  fillBubble: () => false,
});
const filledBallot = createBallotCard({
  fillBubble: () => true,
});
const cyclingTestDeck: Document = {
  width: DOCUMENT_WIDTH,
  height: DOCUMENT_HEIGHT,
  pages: range(0, 6).flatMap(
    (card) =>
      createBallotCard({
        fillBubble: (_page, row, column) => (row - column - card) % 6 === 0,
      }).pages
  ),
};

export const allBubbleBallotFixtures = {
  electionDefinition,
  blankBallot,
  filledBallot,
  cyclingTestDeck,
  // Saved PDFs generated by generate_fixtures.ts
  blankBallotPath: join(allBubbleBallotDir, 'blank-ballot.pdf'),
  filledBallotPath: join(allBubbleBallotDir, 'filled-ballot.pdf'),
  cyclingTestDeckPath: join(allBubbleBallotDir, 'cycling-test-deck.pdf'),
} as const;
