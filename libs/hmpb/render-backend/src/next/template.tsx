import {
  assertDefined,
  iter,
  range,
  throwIllegalValue,
} from '@votingworks/basics';
import { Buffer } from 'buffer';
import React from 'react';
import styled from 'styled-components';
import {
  AnyContest,
  BallotStyle,
  BallotType,
  CandidateContest,
  Election,
  Precinct,
  YesNoContest,
  getCandidatePartiesDescription,
  getContests,
  getPartyForBallotStyle,
} from '@votingworks/types';
import { BallotMode, layOutInColumns } from '@votingworks/hmpb-layout';
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
  LIGHT_GRAY: '#EDEDED',
  DARK_GRAY: '#DADADA',
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
  padding: 0.75rem;
  background-color: ${(p) =>
    p.fill === 'tinted' ? Colors.LIGHT_GRAY : 'none'};
`;

function Instructions() {
  return (
    <Box
      fill="tinted"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
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

function CandidateContest({
  election,
  contest,
}: {
  election: Election;
  contest: CandidateContest;
}) {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
      }}
    >
      <div
        style={{
          background: Colors.LIGHT_GRAY,
          padding: '0.5rem 0.75rem',
        }}
      >
        <h4>{contest.title}</h4>
        <div>
          {contest.seats === 1
            ? 'Vote for 1'
            : `Vote for up to ${contest.seats}`}
        </div>
        {contest.termDescription && <div>{contest.termDescription}</div>}
      </div>
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {contest.candidates.map((candidate, i) => {
          const partyText =
            election.type === 'primary'
              ? undefined
              : getCandidatePartiesDescription(election, candidate);
          return (
            <li
              key={candidate.id}
              style={{
                padding: '0.375rem 0.75rem',
                borderTop:
                  i !== 0 ? `1px solid ${Colors.DARK_GRAY}` : undefined,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  columnGap: '0.5rem',
                  gridTemplateColumns: 'min-content 1fr',
                  alignItems: 'center',
                }}
              >
                <div style={{ marginTop: '0.05rem' }}>
                  <Bubble contestId={contest.title} optionId={candidate.id} />
                </div>
                <strong>{candidate.name}</strong>
                {partyText && (
                  <>
                    <div />
                    <div>{partyText}</div>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {contest.allowWriteIns &&
          range(0, contest.seats).map((writeInIndex) => {
            const writeInId = `write-in-${writeInIndex}`;
            return (
              <li
                key={writeInId}
                style={{
                  display: 'grid',
                  columnGap: '0.5rem',
                  gridTemplateColumns: 'min-content 1fr',
                  padding: '0.375rem 0.75rem',
                  paddingTop: '0.9rem',
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                }}
              >
                <div style={{ marginTop: '0.05rem' }}>
                  <Bubble contestId={contest.title} optionId={writeInId} />
                </div>
                <div>
                  <div>
                    <div
                      style={{
                        borderBottom: `1px solid ${Colors.BLACK}`,
                        height: '1.25rem',
                      }}
                    />
                    <div style={{ fontSize: '0.8rem' }}>write-in</div>
                  </div>
                </div>
              </li>
            );
          })}
      </ul>
    </Box>
  );
}

function BallotMeasureContest({ contest }: { contest: YesNoContest }) {
  return <div>{contest.title}</div>;
}

function Contest({
  contest,
  election,
}: {
  contest: AnyContest;
  election: Election;
}) {
  switch (contest.type) {
    case 'candidate':
      return <CandidateContest election={election} contest={contest} />;
    case 'yesno':
      return <BallotMeasureContest contest={contest} />;
    default:
      return throwIllegalValue(contest);
  }
}

async function BallotPageContent(
  {
    election,
    ballotStyle,
    dimensions,
    ...props
  }: BallotProps & { dimensions: PixelDimensions },
  scratchpad: RenderScratchpad
): Promise<PagedElementResult<BallotProps>> {
  // For now, just one section for candidate contests, one for ballot measures.
  // TODO support arbitrarily defined sections
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }
  const contestSections = iter(election.contests)
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Add as many contests on this page as will fit.
  const contestSectionsLeftToLayout = contestSections;
  const pageSections: JSX.Element[] = [];
  let heightUsed = 0;

  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSectionsLeftToLayout.shift());
    const contestElements = section.map((contest) => (
      <Contest key={contest.id} contest={contest} election={election} />
    ));
    const numColumns = section[0].type === 'candidate' ? 3 : 1;
    // TODO is there a better way to incorporate gutter width here?
    const gutterWidthPx = 0.75 * 16; // Assuming 16px per 1rem
    const columnWidthPx =
      (dimensions.width - gutterWidthPx * (numColumns - 1)) / numColumns;
    const contestMeasurements = await scratchpad.measureElements(
      <>
        {contestElements.map((contest, i) => (
          <div
            className="contestWrapper"
            key={i}
            style={{ width: `${columnWidthPx}px` }}
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

    const { columns, height, leftoverElements } = layOutInColumns({
      elements: measuredContests,
      numColumns,
      maxColumnHeight: dimensions.height - heightUsed,
      gap: gutterWidthPx,
    });

    // Put leftover elements back on the front of the queue
    if (leftoverElements.length > 0) {
      contestSectionsLeftToLayout.unshift(
        leftoverElements.map(({ element }) => element.props.contest)
      );
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (height === 0) {
      break;
    }

    heightUsed += height;
    pageSections.push(
      <div
        key={`section-${pageSections.length + 1}`}
        style={{ display: 'flex', gap: `${gutterWidthPx}px` }}
      >
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${gutterWidthPx}px`,
            }}
          >
            {column.map(({ element }) => element)}
          </div>
        ))}
      </div>
    );
  }

  const currentPageElement =
    pageSections.length > 0 ? (
      <div>{pageSections}</div>
    ) : (
      <div>This page left intentionally blank</div>
    );
  const nextPageProps =
    contestSectionsLeftToLayout.length > 0
      ? {
          ...props,
          ballotStyle,
          election: {
            ...election,
            contests: contestSectionsLeftToLayout.flat(),
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
