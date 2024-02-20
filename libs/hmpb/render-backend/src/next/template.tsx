import { assertDefined, iter, range } from '@votingworks/basics';
import { Buffer } from 'buffer';
import React from 'react';
import styled from 'styled-components';
import {
  BallotStyle,
  BallotType,
  CandidateContest,
  Election,
  Precinct,
  getPartyForBallotStyle,
} from '@votingworks/types';
import { BallotMode } from '@votingworks/hmpb-layout';
import { BallotPageTemplate, PagedElementResult } from './render_ballot';
import { RenderScratchpad } from './renderer';
import {
  Bubble,
  Page,
  QrCodeSlot,
  TIMING_MARK_DIMENSIONS,
  TimingMark,
} from './ballot_components';
import { InchDimensions, PixelDimensions } from './types';
import {
  ArrowRightCircle,
  InstructionsDiagramFillBubble,
  InstructionsDiagramWriteIn,
} from './svg_assets';

const Colors = {
  BLACK: '#000000',
  GRAY: '#EDEDED',
} as const;

export interface BallotProps {
  election: Election;
  ballotStyle: BallotStyle;
  precinct: Precinct;
  ballotType: BallotType;
  ballotMode: BallotMode;
}

export const pageDimensions: InchDimensions = {
  width: 8.5,
  height: 11,
};

export const pageMargins = {
  top: 0.125,
  right: 0.125,
  bottom: 0.125,
  left: 0.125,
} as const;

function TimingMarkGrid({ children }: { children: React.ReactNode }) {
  const columnsPerInch = 4;
  const rowsPerInch = 4;

  const gridRows = pageDimensions.height * rowsPerInch - 3;
  const gridColumns = pageDimensions.width * columnsPerInch;

  const timingMarkRow = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      {range(0, gridColumns).map((i) => (
        <TimingMark key={i} />
      ))}
    </div>
  );
  const timingMarkColumn = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        top: `-${TIMING_MARK_DIMENSIONS.height}in`,
        height: `calc(100% + ${2 * TIMING_MARK_DIMENSIONS.height}in)`,
      }}
    >
      {range(0, gridRows - 2).map((i) => (
        <TimingMark key={i} />
      ))}
    </div>
  );

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {timingMarkRow}
      <div
        style={{
          flex: 1,
          display: 'flex',
          // Prevent this flex item from overflowing its container
          // https://stackoverflow.com/a/66689926
          minHeight: 0,
        }}
      >
        {timingMarkColumn}
        {children}
        {timingMarkColumn}
      </div>
      {timingMarkRow}
    </div>
  );
}

function Header({
  election,
  ballotStyle,
  precinct,
  ballotType,
  ballotMode,
}: BallotProps) {
  const ballotModeLabel: Record<BallotMode, string> = {
    sample: 'Sample',
    test: 'Test',
    official: 'Official',
  };

  const ballotTypeLabel: Record<BallotType, string> = {
    [BallotType.Absentee]: ' Absentee',
    [BallotType.Precinct]: '',
    [BallotType.Provisional]: ' Provisional',
  };

  const ballotTitle = `${ballotModeLabel[ballotMode]}${ballotTypeLabel[ballotType]} Ballot`;

  const party =
    election.type === 'primary'
      ? assertDefined(
          getPartyForBallotStyle({ election, ballotStyleId: ballotStyle.id })
        ).fullName
      : undefined;

  const date = Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(election.date));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '0.75rem',
        alignItems: 'center',
        paddingBottom: '0.125rem',
      }}
    >
      <img
        style={{ height: '100%', marginTop: '0.125rem' }}
        src={`data:image/svg+xml;base64,${Buffer.from(election.seal).toString(
          'base64'
        )}`}
      />
      <div>
        <h1>
          {ballotTitle}
          {party && ` • ${party}`}
        </h1>
        <h3>
          {election.title} • {date}
        </h3>
        <div>
          {precinct.name}, {election.county.name}, {election.state}
        </div>
      </div>
    </div>
  );
}

const Box = styled.div<{ fill?: 'transparent' | 'tinted' }>`
  border: 1px solid ${Colors.BLACK};
  border-top-width: 3px;
  padding: 0.5rem;
  background-color: ${(p) => (p.fill === 'tinted' ? Colors.GRAY : 'none')};
`;

function Instructions() {
  return (
    <Box
      fill="tinted"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          flex: '1 1 0',
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <div>
          <h3>Instructions</h3>
          <b>To Vote:</b>
          <div>To vote, completely fill in the oval next to your choice.</div>
        </div>
        <div style={{ minWidth: '7rem', alignSelf: 'center' }}>
          <InstructionsDiagramFillBubble />
        </div>
      </div>
      <div
        style={{
          flex: '1.5 1 0',
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <div>
          <b>To Vote for a Write-In:</b>
          <div>
            To vote for a person whose name is not on the ballot, write the
            person’s name on the "write-in" line and completely fill in the oval
            next to the line.
          </div>
        </div>
        <div style={{ minWidth: '8rem', alignSelf: 'center' }}>
          <InstructionsDiagramWriteIn />
        </div>
      </div>
    </Box>
  );
}

function Footer({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages: number;
}) {
  const continueVoting = (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <h3>
        {pageNumber % 2 === 1
          ? 'Turn ballot over and continue voting'
          : 'Continue voting on next ballot sheet'}
      </h3>
      <ArrowRightCircle style={{ height: '2rem' }} />
    </div>
  );
  const ballotComplete = <h3>You have completed voting.</h3>;
  const endOfPageInstruction =
    pageNumber === totalPages ? ballotComplete : continueVoting;

  return (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <QrCodeSlot />
      <Box
        fill="tinted"
        style={{
          padding: '0.25rem 0.5rem',
          flex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem' }}>Page</div>
          <h2>
            {pageNumber}/{totalPages}
          </h2>
        </div>
        <div>{endOfPageInstruction}</div>
      </Box>
    </div>
  );
}

const ContestBox = styled.div`
  background-color: #eee;
  border: 1px solid black;
  padding: 1rem;
`;

function Contest({ contest }: { contest: CandidateContest }) {
  return (
    <ContestBox className="contest">
      <div>{contest.title}</div>
      <ul style={{ listStyleType: 'none' }}>
        {contest.candidates.map((candidate) => (
          <li key={candidate.id} style={{ display: 'flex' }}>
            <Bubble contestId={contest.title} optionId={candidate.id} />{' '}
            {candidate.name}
          </li>
        ))}
      </ul>
    </ContestBox>
  );
}

function BallotPageFrame({
  election,
  ballotStyle,
  precinct,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
}: BallotProps & {
  pageNumber: number;
  totalPages: number;
  children: JSX.Element;
}): JSX.Element {
  return (
    <Page
      key={pageNumber}
      pageNumber={pageNumber}
      dimensions={pageDimensions}
      margins={pageMargins}
    >
      <TimingMarkGrid>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '0.125in',
          }}
        >
          {pageNumber === 1 && (
            <>
              <Header
                election={election}
                ballotStyle={ballotStyle}
                precinct={precinct}
                ballotType={ballotType}
                ballotMode={ballotMode}
              />
              <Instructions />
            </>
          )}
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
          <Footer pageNumber={pageNumber} totalPages={totalPages} />
        </div>
      </TimingMarkGrid>
    </Page>
  );
}

/**
 * Here we use a simple single-column layout, but we could also use more complex
 * algorithms. The key is that the template has full control to determine:
 * - How many contests fit on each page
 * - How to lay out those contests
 * We can use this approach to implement complex behavior such as contest
 * sections and multi-column layouts.
 */
async function BallotPageContent(
  {
    election,
    dimensions,
    ...props
  }: BallotProps & { dimensions: PixelDimensions },
  scratchpad: RenderScratchpad
): Promise<PagedElementResult<BallotProps>> {
  const contestElements = election.contests.map(
    (contest) =>
      contest.type === 'candidate' && (
        <Contest key={contest.title} contest={contest} />
      )
  );

  const contestMeasurements = await scratchpad.measureElements(
    <>
      {contestElements.map((contest, i) => (
        <div
          className="contestWrapper"
          key={i}
          style={{ width: dimensions.width }}
        >
          {contest}
        </div>
      ))}
    </>,
    '.contestWrapper'
  );
  const measuredContests = iter(contestElements)
    .zip(contestMeasurements)
    .map(([element, measurements]) => ({ element, ...measurements }))
    .toArray();

  // Add as many contests on this page as will fit.
  const pageContests: React.ReactNode[] = [];
  let heightUsed = 0;
  while (measuredContests.length > 0) {
    const nextContestHeight = measuredContests[0].height;
    if (heightUsed + nextContestHeight > dimensions.height) {
      break;
    }
    const nextContest = assertDefined(measuredContests.shift());
    pageContests.push(nextContest.element);
    heightUsed += nextContest.height;
  }

  const currentPageElement =
    pageContests.length > 0 ? (
      <div>{pageContests}</div>
    ) : (
      <div>This page left intentionally blank</div>
    );
  const nextPageProps =
    measuredContests.length > 0
      ? {
          ...props,
          election: {
            ...election,
            contests: election.contests.slice(pageContests.length),
          },
        }
      : undefined;

  return {
    currentPageElement,
    nextPageProps,
  };
}

export const ballotPageTemplate: BallotPageTemplate<BallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
