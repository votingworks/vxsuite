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
  BallotType,
  CandidateContest,
  Election,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getCandidatePartiesDescription,
  getContests,
  getPartyForBallotStyle,
  getPrecinctById,
} from '@votingworks/types';
import { BallotMode, layOutInColumns } from '@votingworks/hmpb-layout';
import {
  BallotPageTemplate,
  BaseBallotProps,
  PagedElementResult,
} from './render_ballot';
import { RenderScratchpad } from './renderer';
import {
  Bubble as BubbleComponent,
  OptionInfo,
  Page,
  QrCodeSlot,
  TimingMarkGrid,
  pageMargins,
} from './ballot_components';
import { PixelDimensions } from './types';
import {
  ArrowRightCircle,
  InstructionsDiagramFillBubble,
  InstructionsDiagramWriteIn,
} from './svg_assets';

const Bubble = styled(BubbleComponent)`
  margin-top: 0.05rem;
`;

const Colors = {
  BLACK: '#000000',
  LIGHT_GRAY: '#EDEDED',
  DARK_GRAY: '#DADADA',
} as const;

function Header({
  election,
  ballotStyleId,
  precinctId,
  ballotType,
  ballotMode,
}: BaseBallotProps) {
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
      ? assertDefined(getPartyForBallotStyle({ election, ballotStyleId }))
          .fullName
      : undefined;

  const date = Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(election.date.toMidnightDatetimeWithSystemTimezone());

  const precinct = assertDefined(getPrecinctById({ election, precinctId }));

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        paddingBottom: '0.125rem',
      }}
    >
      <div
        style={{
          // Make the seal a square that matches the height of the header text
          // next to it
          height: '100%',
          aspectRatio: '1 / 1',
          backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
            election.seal
          ).toString('base64')})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          marginTop: '0.125rem',
        }}
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
          {[precinct.name, election.county.name, election.state]
            .filter(Boolean)
            .join(', ')}
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
          <b>To Vote for a Write-in:</b>
          <div>
            To vote for a person whose name is not on the ballot, write the
            person’s name on the "Write-in" line and completely fill in the oval
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

export function Footer({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages: number;
}): JSX.Element {
  const continueVoting = (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
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
  ballotStyleId,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
}: BaseBallotProps & {
  pageNumber: number;
  totalPages: number;
  children: JSX.Element;
}): JSX.Element {
  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  return (
    <Page
      key={pageNumber}
      pageNumber={pageNumber}
      dimensions={pageDimensions}
      margins={pageMargins}
    >
      <TimingMarkGrid pageDimensions={pageDimensions}>
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
                ballotStyleId={ballotStyleId}
                precinctId={precinctId}
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

const ContestHeader = styled.div`
  background: ${Colors.LIGHT_GRAY};
  padding: 0.5rem 0.75rem;
`;

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
      <ContestHeader>
        <h4>{contest.title}</h4>
        <div>
          {contest.seats === 1
            ? 'Vote for 1'
            : `Vote for up to ${contest.seats}`}
        </div>
        {contest.termDescription && <div>{contest.termDescription}</div>}
      </ContestHeader>
      <ul>
        {contest.candidates.map((candidate, i) => {
          const partyText =
            election.type === 'primary'
              ? undefined
              : getCandidatePartiesDescription(election, candidate);
          const optionInfo: OptionInfo = {
            type: 'option',
            contestId: contest.id,
            optionId: candidate.id,
          };
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
                <Bubble optionInfo={optionInfo} />
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
            const optionInfo: OptionInfo = {
              type: 'write-in',
              contestId: contest.id,
              writeInIndex,
              writeInArea: {
                top: 0.5,
                left: -1,
                bottom: 0.5,
                right: 8,
              },
            };
            return (
              <li
                key={writeInIndex}
                style={{
                  display: 'grid',
                  columnGap: '0.5rem',
                  gridTemplateColumns: 'min-content 1fr',
                  padding: '0.25rem 0.75rem',
                  paddingTop: '0.9rem',
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                }}
              >
                <Bubble optionInfo={optionInfo} />
                <div>
                  <div>
                    <div
                      style={{
                        borderBottom: `1px solid ${Colors.BLACK}`,
                        height: '1.25rem',
                      }}
                    />
                    <div style={{ fontSize: '0.8rem' }}>Write-in</div>
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
  return (
    <Box style={{ padding: 0 }}>
      <ContestHeader>
        <h4> {contest.title}</h4>
      </ContestHeader>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.25rem',
        }}
      >
        <div style={{ padding: '0.5rem 0.75rem' }}>{contest.description}</div>
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'end',
          }}
        >
          {[contest.yesOption, contest.noOption].map((option) => (
            <li
              key={option.id}
              style={{
                padding: '0.375rem 0.75rem ',
                borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
              }}
            >
              <div
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
              >
                <Bubble
                  optionInfo={{
                    type: 'option',
                    contestId: contest.id,
                    optionId: option.id,
                  }}
                />
                <strong>{option.label}</strong>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Box>
  );
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

function BlankPageMessage() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <h2>This page intentionally left blank</h2>
    </div>
  );
}

async function BallotPageContent(
  props: (BaseBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<PagedElementResult<BaseBallotProps>> {
  if (!props) {
    return {
      currentPageElement: <BlankPageMessage />,
      nextPageProps: undefined,
    };
  }

  const { election, ballotStyleId, dimensions, ...restProps } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  // For now, just one section for candidate contests, one for ballot measures.
  // TODO support arbitrarily defined sections
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }
  const contestSections = iter(contests)
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Add as many contests on this page as will fit.
  const contestSectionsLeftToLayout = contestSections;
  const pageSections: JSX.Element[] = [];
  let heightUsed = 0;

  // TODO is there a better way to incorporate gutter width here?
  const gutterWidthPx = 0.75 * 16; // Assuming 16px per 1rem
  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSectionsLeftToLayout.shift());
    const contestElements = section.map((contest) => (
      <Contest key={contest.id} contest={contest} election={election} />
    ));
    const numColumns = section[0].type === 'candidate' ? 3 : 2;
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${gutterWidthPx}px`,
        }}
      >
        {pageSections}
      </div>
    ) : (
      <BlankPageMessage />
    );
  const nextPageProps =
    contestSectionsLeftToLayout.length > 0
      ? {
          ...restProps,
          ballotStyleId,
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

export const vxDefaultBallotTemplate: BallotPageTemplate<BaseBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
