import {
  assertDefined,
  err,
  iter,
  ok,
  range,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  AnyContest,
  BallotMode,
  BallotStyleId,
  BallotType,
  BaseBallotProps,
  CandidateContest as CandidateContestStruct,
  Election,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getPartyForBallotStyle,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  CandidatePartyList,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import React from 'react';
import {
  BallotLayoutError,
  BallotPageTemplate,
  ContentComponentResult,
} from '../render_ballot';
import { RenderScratchpad } from '../renderer';
import {
  OptionInfo,
  Page,
  TimingMarkGrid,
  WRITE_IN_OPTION_CLASS,
  pageMarginsInches,
  AlignedBubble,
  Colors,
  DualLanguageText,
  primaryLanguageCode,
  WriteInLabel,
  ColorTint,
  ColorTints,
  QrCodeSlot,
} from '../ballot_components';
import { PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { Watermark } from './watermark';
import {
  allCaps,
  Box,
  ContestHeader,
  ContestTitle,
  HandCountInsignia,
  Instructions,
  isFederalOfficeContest,
  NhBaseStyles,
} from './nh_state_ballot_components';

function Header({
  election,
  ballotType,
  ballotMode,
  ballotStyleId,
}: {
  election: Election;
  ballotType: BallotType;
  ballotMode: BallotMode;
  ballotStyleId: BallotStyleId;
}): JSX.Element {
  const party = assertDefined(
    getPartyForBallotStyle({ election, ballotStyleId })
  );

  const absenteeLabel = ballotType === 'absentee' ? 'ABSENTEE' : undefined;
  const ballotTitle = {
    official: 'OFFICIAL BALLOT',
    test: 'TEST BALLOT',
    sample: 'SAMPLE BALLOT',
  }[ballotMode];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        alignItems: 'center',
      }}
    >
      <div style={{ fontWeight: 'bold' }}>
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '9pt',
          }}
        >
          INSTRUCTIONS TO VOTERS
        </div>
        <Instructions />
      </div>
      <div
        style={{
          ...allCaps,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignSelf: 'stretch',
          padding: '0 5rem',
        }}
      >
        {absenteeLabel && <h3>{absenteeLabel}</h3>}
        <h5>{ballotTitle} FOR</h5>
        <div style={{ lineHeight: '1.3' }}>
          <h1>{electionStrings.countyName(election.county)}</h1>
          {<h1>{electionStrings.partyName(party)}</h1>}
        </div>
        <h5>{electionStrings.electionTitle(election)}</h5>
        <h5>{electionStrings.electionDate(election)}</h5>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            height: '0.946in',
            aspectRatio: '1 / 1',
            backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
              election.seal
            ).toString('base64')})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div style={{ textAlign: 'right' }}>
          <img
            src={`data:image/svg+xml;base64,${Buffer.from(
              assertDefined(election.signature).image
            ).toString('base64')}`}
            style={{
              width: '1.5in',
            }}
          />
          <div
            style={{
              ...allCaps,
              fontSize: '6.25pt',
              fontWeight: 'bold',
              marginTop: '-1rem',
              marginRight: '0.25rem',
            }}
          >
            {assertDefined(election.signature).caption}
          </div>
        </div>
      </div>
    </div>
  );
}

// Almost identical to vx_default_ballot_template BallotPageFrame except additional props are passed to Header.
function BallotPageFrame({
  election,
  ballotStyleId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  watermark,
  colorTint,
  isHandCount,
}: NhPrimaryBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): Result<JSX.Element, BallotLayoutError> {
  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  return ok(
    <BackendLanguageContextProvider
      key={pageNumber}
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={election.ballotStrings}
    >
      <Page
        pageNumber={pageNumber}
        dimensions={pageDimensions}
        margins={pageMarginsInches}
      >
        {watermark && <Watermark>{watermark}</Watermark>}
        <TimingMarkGrid
          pageDimensions={pageDimensions}
          timingMarkStyle={isHandCount ? { visibility: 'hidden' } : undefined}
          ballotMode={ballotMode}
        >
          <div
            style={{
              fontFamily: 'Helvetica Condensed',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '0.125in',
            }}
          >
            {pageNumber === 1 && (
              <div
                style={{
                  backgroundColor: ColorTints[colorTint],
                  padding: '0.5rem',
                  borderBottom: '5px solid black',
                }}
              >
                <Header
                  election={election}
                  ballotStyleId={ballotStyleId}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                />
              </div>
            )}
            <div
              style={{
                flex: 1,
                // Prevent this flex item from overflowing its container
                // https://stackoverflow.com/a/66689926
                minHeight: 0,
                position: 'relative',
              }}
            >
              {children}
              {isHandCount && (
                <HandCountInsignia
                  pageNumber={pageNumber}
                  totalPages={totalPages}
                  election={election}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  colorTint={colorTint}
                  ballotStyleId={ballotStyleId}
                />
              )}
            </div>
            {!isHandCount && (
              <div>
                <QrCodeSlot />
              </div>
            )}
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

function CandidateContest({
  election,
  contest,
  compact,
  colorTint,
}: {
  election: Election;
  contest: CandidateContestStruct;
  compact?: boolean;
  colorTint?: ColorTint;
}) {
  const voteForText = {
    1: hmpbStrings.hmpbVoteForNotMoreThan1,
    2: hmpbStrings.hmpbVoteFor2,
    3: hmpbStrings.hmpbVoteFor3,
    4: hmpbStrings.hmpbVoteFor4,
    5: hmpbStrings.hmpbVoteFor5,
    6: hmpbStrings.hmpbVoteFor6,
    7: hmpbStrings.hmpbVoteFor7,
    8: hmpbStrings.hmpbVoteFor8,
    9: hmpbStrings.hmpbVoteFor9,
    10: hmpbStrings.hmpbVoteFor10,
  }[contest.seats];
  if (!voteForText) {
    throw new Error(
      `Unsupported number of seats for contest: ${contest.seats}`
    );
  }

  const willBeElectedText = {
    2: hmpbStrings.hmpb2WillBeElected,
    3: hmpbStrings.hmpb3WillBeElected,
    4: hmpbStrings.hmpb4WillBeElected,
    5: hmpbStrings.hmpb5WillBeElected,
    6: hmpbStrings.hmpb6WillBeElected,
    7: hmpbStrings.hmpb7WillBeElected,
    8: hmpbStrings.hmpb8WillBeElected,
    9: hmpbStrings.hmpb9WillBeElected,
    10: hmpbStrings.hmpb10WillBeElected,
  }[contest.seats];

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
      }}
    >
      <ContestHeader colorTint={colorTint}>
        <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
        <h5>
          {voteForText}
          {willBeElectedText && <span>; {willBeElectedText}</span>}
        </h5>
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            <div>{electionStrings.contestTerm(contest)}</div>
          </DualLanguageText>
        )}
      </ContestHeader>
      <ul
        style={{
          marginBottom: '0.125rem',
          borderBottom: '1px solid black',
        }}
      >
        {contest.candidates.map((candidate, i) => {
          const partyText =
            election.type === 'primary' ? undefined : (
              <CandidatePartyList
                candidate={candidate}
                electionParties={election.parties}
              />
            );
          const optionInfo: OptionInfo = {
            type: 'option',
            contestId: contest.id,
            optionId: candidate.id,
          };
          return (
            <li key={candidate.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  paddingRight: '1rem',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    borderTop:
                      i !== 0 ? `1px solid ${Colors.BLACK}` : undefined,
                    padding: '0.125rem 0 ',
                  }}
                >
                  <h4>{candidate.name}</h4>
                  {partyText && (
                    <DualLanguageText delimiter="/">
                      <div>{partyText}</div>
                    </DualLanguageText>
                  )}
                </div>
                <AlignedBubble compact={compact} optionInfo={optionInfo} />
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
                top: compact ? 0.7 : 0.8,
                right: -0.9,
                bottom: 0.2,
                left: 8.7,
              },
            };
            return (
              <li
                key={writeInIndex}
                className={WRITE_IN_OPTION_CLASS}
                style={{
                  display: 'flex',
                  textAlign: 'right',
                  alignItems: 'center',
                  paddingRight: '1rem',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'end',
                    borderTop: `1px solid ${Colors.BLACK}`,
                    padding: '0.875rem 0 0.125rem 0',
                  }}
                >
                  <div
                    style={{
                      textTransform: 'uppercase',
                      fontSize: '6pt',
                      paddingRight: '0.25rem',
                    }}
                  >
                    <WriteInLabel />
                  </div>
                </div>
                <AlignedBubble compact={compact} optionInfo={optionInfo} />
              </li>
            );
          })}
      </ul>
    </Box>
  );
}

function BallotMeasureContest({
  contest,
  compact,
  colorTint,
}: {
  contest: YesNoContest;
  compact?: boolean;
  colorTint?: ColorTint;
}) {
  return (
    <Box style={{ padding: 0 }}>
      <ContestHeader colorTint={colorTint}>
        <DualLanguageText delimiter="/">
          <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
        </DualLanguageText>
      </ContestHeader>
      <div
        style={{
          display: 'flex',
          flexDirection: compact ? 'row' : 'column',
          justifyContent: 'space-between',
          gap: '0.25rem',
        }}
      >
        <div
          style={{
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <DualLanguageText>
            <RichText
              tableBorderWidth={'1px'}
              tableBorderColor={Colors.DARKER_GRAY}
              tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
            >
              {electionStrings.contestDescription(contest)}
            </RichText>
          </DualLanguageText>
        </div>
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
                padding: '0.375rem 0.5rem',
                borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
                borderLeft: compact
                  ? `1px solid ${Colors.LIGHT_GRAY}`
                  : undefined,
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <strong style={{ flex: 1, textAlign: 'right' }}>
                  <DualLanguageText delimiter="/">
                    {electionStrings.contestOptionLabel(option)}
                  </DualLanguageText>
                </strong>
                <AlignedBubble
                  compact={compact}
                  optionInfo={{
                    type: 'option',
                    contestId: contest.id,
                    optionId: option.id,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Box>
  );
}

function Contest({
  compact,
  contest,
  election,
  colorTint,
}: {
  compact?: boolean;
  contest: AnyContest;
  election: Election;
  colorTint?: ColorTint;
}) {
  switch (contest.type) {
    case 'candidate':
      return (
        <CandidateContest
          compact={compact}
          election={election}
          contest={contest}
          colorTint={colorTint}
        />
      );
    case 'yesno':
      return (
        <BallotMeasureContest
          compact={compact}
          contest={contest}
          colorTint={colorTint}
        />
      );
    default:
      return throwIllegalValue(contest);
  }
}

async function BallotPageContent(
  props: (NhPrimaryBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<NhPrimaryBallotProps>> {
  if (!props) {
    return ok({
      currentPageElement: <React.Fragment />,
      nextPageProps: undefined,
    });
  }

  const { compact, election, ballotStyleId, dimensions, ...restProps } = props;
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
    .filter((contest) =>
      restProps.isFederalOnlyOffices ? isFederalOfficeContest(contest) : true
    )
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Add as many contests on this page as will fit.
  const contestSectionsLeftToLayout = contestSections;
  const pageSections: JSX.Element[] = [];
  let heightUsed = 0;

  // TODO is there some way we can use rem here instead of having to know the
  // font size and map to px?
  const horizontalGapPx = 5;
  const verticalGapPx = 0;
  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSectionsLeftToLayout.shift());
    const contestElements = section.map((contest) => (
      <Contest
        key={contest.id}
        compact={compact}
        contest={contest}
        election={election}
        colorTint={props.colorTint}
      />
    ));
    const numColumns = section[0].type === 'candidate' ? 3 : 1;
    const columnWidthPx =
      (dimensions.width - horizontalGapPx * (numColumns - 1)) / numColumns;
    const contestMeasurements = await scratchpad.measureElements(
      <BackendLanguageContextProvider
        currentLanguageCode={primaryLanguageCode(ballotStyle)}
        uiStringsPackage={election.ballotStrings}
      >
        {contestElements.map((contest, i) => (
          <div
            className="contestWrapper"
            key={i}
            style={{
              fontFamily: 'Helvetica Condensed',
              width: `${columnWidthPx}px`,
            }}
          >
            {contest}
          </div>
        ))}
      </BackendLanguageContextProvider>,
      '.contestWrapper'
    );
    const measuredContests = iter(contestElements)
      .zip(contestMeasurements)
      .map(([element, measurements]) => ({ element, ...measurements }))
      .async();

    const { columns, height } = await layOutInColumns({
      elements: measuredContests,
      numColumns,
      maxColumnHeight: dimensions.height - heightUsed,
      elementGap: verticalGapPx,
    });

    // Put contests we didn't lay out back on the front of the queue
    const numElementsUsed = columns.flat().length;
    if (numElementsUsed < section.length) {
      contestSectionsLeftToLayout.unshift(section.slice(numElementsUsed));
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (height === 0) {
      break;
    }

    // Add vertical gap to account for space between sections
    heightUsed += height + verticalGapPx;
    pageSections.push(
      <div
        key={`section-${pageSections.length + 1}`}
        style={{ display: 'flex' }}
      >
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalGapPx}px`,
              paddingRight:
                i !== columns.length - 1 ? `${horizontalGapPx / 2}px` : 0,
              paddingLeft: i !== 0 ? `${horizontalGapPx / 2}px` : 0,
              borderLeft: i !== 0 ? `1px solid ${Colors.BLACK}` : 0,
            }}
          >
            {column.map(({ element }) => element)}
          </div>
        ))}
      </div>
    );
  }

  const contestsLeftToLayout = contestSectionsLeftToLayout.flat();
  if (
    contests.length > 0 &&
    contestsLeftToLayout.flat().length === contests.length
  ) {
    return err({
      error: 'contestTooLong',
      contest: contestsLeftToLayout[0],
    });
  }

  const currentPageElement =
    pageSections.length > 0 ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${verticalGapPx}px`,
        }}
      >
        {pageSections}
      </div>
    ) : (
      <React.Fragment />
    );
  const nextPageProps =
    contestSectionsLeftToLayout.length > 0
      ? {
          ...restProps,
          compact,
          ballotStyleId,
          election: {
            ...election,
            contests: contestSectionsLeftToLayout.flat(),
          },
        }
      : undefined;

  return ok({
    currentPageElement,
    nextPageProps,
  });
}

export type NhPrimaryBallotProps = BaseBallotProps & {
  colorTint: ColorTint;
  isHandCount?: boolean;
  isFederalOnlyOffices?: boolean;
};

export const nhPrimaryBallotTemplate: BallotPageTemplate<NhPrimaryBallotProps> =
  {
    frameComponent: BallotPageFrame,
    contentComponent: BallotPageContent,
    stylesComponent: NhBaseStyles,
  };
