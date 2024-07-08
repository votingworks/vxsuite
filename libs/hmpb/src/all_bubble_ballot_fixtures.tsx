import React from 'react';
import {
  BallotPaperSize,
  BallotType,
  CandidateContest,
  DistrictId,
  Election,
  ElectionId,
  GridPositionOption,
  VotesDict,
  ballotPaperDimensions,
} from '@votingworks/types';
import { DateWithoutTime, assertDefined, range } from '@votingworks/basics';
import { join } from 'path';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import {
  Bubble,
  Page,
  TimingMarkGrid,
  pageMarginsInches,
} from './ballot_components';
import {
  BallotPageTemplate,
  BaseBallotProps,
  PagedElementResult,
  renderAllBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { Footer } from './vx_default_ballot_template';
import { RenderScratchpad, Renderer } from './renderer';
import { PixelDimensions } from './types';
import { markBallotDocument } from './mark_ballot';
import { concatenatePdfs } from './concatenate_pdfs';

const debug = makeDebug('hmpb:ballot_fixtures');

const fixturesDir = join(__dirname, '../fixtures');

function contestId(page: number) {
  return `test-contest-page-${page}`;
}

function candidateId(page: number, row: number, column: number) {
  return `test-candidate-page-${page}-row-${row}-column-${column}`;
}

const ballotPaperSize = BallotPaperSize.Letter;
const pageDimensions = ballotPaperDimensions(ballotPaperSize);
// Corresponds to the NH Accuvote ballot grid, which we mimic so that our
// interpreter can support both Accuvote-style ballots and our ballots.
// This formula is replicated in libs/ballot-interpreter/src/ballot_card.rs.
const columnsPerInch = 4;
const rowsPerInch = 4;
const gridRows = pageDimensions.height * rowsPerInch - 3;
const gridColumns = pageDimensions.width * columnsPerInch;
const footerRowHeight = 2;
const numPages = 2;

function createElection(): Election {
  const districtId = 'test-district' as DistrictId;
  const precinctId = 'test-precinct';

  const gridPositions = range(1, numPages + 1).flatMap((page) =>
    range(1, gridRows - footerRowHeight - 1).flatMap((row) =>
      range(1, gridColumns - 1).map((column) => ({
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

  return {
    id: 'all-bubble-ballot-election' as ElectionId,
    ballotLayout: {
      paperSize: ballotPaperSize,
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
      },
    ],
    state: 'Test State',
    title: 'Test Election - All Bubble Ballot',
    type: 'general',
    seal: '',
    ballotStrings: {},
  };
}

function BallotPageFrame({
  election,
  pageNumber,
  totalPages,
  children,
}: BaseBallotProps & {
  pageNumber: number;
  totalPages: number;
  children: JSX.Element;
}): JSX.Element {
  const dimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  return (
    <Page
      key={pageNumber}
      pageNumber={pageNumber}
      dimensions={dimensions}
      margins={pageMarginsInches}
    >
      <TimingMarkGrid pageDimensions={dimensions}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '0.05in',
          }}
        >
          <div
            style={{
              flex: 1,
              // Prevent this flex item from overflowing its container
              // https://stackoverflow.com/a/66689926
              minHeight: 0,
            }}
          >
            {children}
          </div>
          <Footer
            election={election}
            ballotStyleId={election.ballotStyles[0].id}
            precinctId={election.precincts[0].id}
            pageNumber={pageNumber}
            totalPages={totalPages}
          />
        </div>
      </TimingMarkGrid>
    </Page>
  );
}

// eslint-disable-next-line @typescript-eslint/require-await
async function BallotPageContent(
  props: (BaseBallotProps & { dimensions: PixelDimensions }) | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _scratchpad: RenderScratchpad
): Promise<PagedElementResult<BaseBallotProps>> {
  const { election, ...restProps } = assertDefined(props);
  const pageNumber = numPages - election.contests.length + 1;
  const bubbles = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingTop: '0.12in',
        paddingBottom: '0.055in',
      }}
    >
      {range(1, gridRows - footerRowHeight - 1).flatMap((row) => (
        <div
          key={`row-${row}`}
          style={{ display: 'flex', justifyContent: 'space-between' }}
        >
          {range(1, gridColumns - 1).map((column) => (
            <Bubble
              key={`bubble-${row}-${column}`}
              optionInfo={{
                type: 'option',
                contestId: contestId(pageNumber),
                optionId: candidateId(pageNumber, row, column),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
  const contestsLeft = election.contests.slice(1);
  return {
    currentPageElement: bubbles,
    nextPageProps:
      contestsLeft.length === 0
        ? undefined
        : {
            ...restProps,
            election: {
              ...election,
              contests: contestsLeft,
            },
          },
  };
}

const allBubbleBallotTemplate: BallotPageTemplate<BaseBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};

export const allBubbleBallotFixtures = (() => {
  const dir = join(fixturesDir, 'all-bubble-ballot');
  const electionPath = join(dir, 'election.json');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const filledBallotPath = join(dir, 'filled-ballot.pdf');
  const cyclingTestDeckPath = join(dir, 'cycling-test-deck.pdf');
  const election = createElection();
  const ballotProps: BaseBallotProps = {
    election,
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotMode: 'test',
    ballotType: BallotType.Precinct,
  };

  return {
    dir,
    electionPath,
    blankBallotPath,
    filledBallotPath,
    cyclingTestDeckPath,

    async generate(renderer: Renderer, { blankOnly = false } = {}) {
      debug(`Generating: ${blankBallotPath}`);
      const { electionDefinition, ballotDocuments } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          allBubbleBallotTemplate,
          [ballotProps],
          'vxf'
        );

      const [blankBallot] = ballotDocuments;
      const blankBallotPdf = await blankBallot.renderToPdf();

      let filledBallotPdf = Buffer.from('');
      let cyclingTestDeckPdf = Buffer.from('');
      if (!blankOnly) {
        debug(`Generating: ${filledBallotPath}`);
        const filledVotes: VotesDict = Object.fromEntries(
          election.contests.map((contest) => [
            contest.id,
            (contest as CandidateContest).candidates,
          ])
        );
        const filledBallot = await markBallotDocument(
          renderer,
          blankBallot,
          filledVotes
        );
        filledBallotPdf = await filledBallot.renderToPdf();

        debug(`Generating: ${cyclingTestDeckPath}`);
        const [gridLayout] = assertDefined(
          electionDefinition.election.gridLayouts
        );
        const gridPositionByCandidateId = Object.fromEntries(
          gridLayout.gridPositions.map((position) => [
            (position as GridPositionOption).optionId,
            position,
          ])
        );
        const cyclingTestDeckSheetPdfs = await Promise.all(
          range(0, 6).map(async (sheetNumber) => {
            const votesForSheet: VotesDict = Object.fromEntries(
              election.contests.map((contest) => [
                contest.id,
                (contest as CandidateContest).candidates.flatMap(
                  (candidate) => {
                    const { row, column } =
                      gridPositionByCandidateId[candidate.id];
                    // Bubbles aren't perfectly aligned with the grid, but they are
                    // extremely close, so rounding is fine
                    if (
                      (Math.round(row) - Math.round(column) - sheetNumber) %
                        6 ===
                      0
                    ) {
                      return [candidate];
                    }
                    return [];
                  }
                ),
              ])
            );
            const sheetDocument = await markBallotDocument(
              renderer,
              blankBallot,
              votesForSheet
            );
            return await sheetDocument.renderToPdf();
          })
        );
        cyclingTestDeckPdf = await concatenatePdfs(cyclingTestDeckSheetPdfs);
      }

      return {
        electionDefinition,
        blankBallotPdf,
        filledBallotPdf,
        cyclingTestDeckPdf,
      };
    },
  };
})();
