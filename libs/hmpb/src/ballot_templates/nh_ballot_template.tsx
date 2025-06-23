import React from 'react';
import {
  assert,
  assertDefined,
  err,
  iter,
  ok,
  range,
  throwIllegalValue,
} from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  AnyContest,
  BallotStyle,
  BallotStyleId,
  BallotType,
  CandidateContest as CandidateContestStruct,
  Election,
  LanguageCode,
  NhPrecinctSplitOptions,
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
import { parse as parseHtml } from 'node-html-parser';
import {
  BallotPageTemplate,
  BaseBallotProps,
  ContentComponentResult,
} from '../render_ballot';
import { RenderScratchpad } from '../renderer';
import {
  OptionInfo,
  Page,
  TimingMarkGrid,
  WRITE_IN_OPTION_CLASS,
  pageMarginsInches,
  BlankPageMessage,
  Box,
  AlignedBubble,
  Colors,
  ContestHeader,
  DualLanguageText,
  Footer,
  Instructions,
  primaryLanguageCode,
  WriteInLabel,
  ColorTint,
} from '../ballot_components';
import { BallotMode, PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { Watermark } from './watermark';
import { ArrowRightCircle } from '../svg_assets';

function Header({
  election,
  ballotStyleId,
  ballotType,
  ballotMode,

  electionTitleOverride,
  electionSealOverride,
  clerkSignatureImage,
  clerkSignatureCaption,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
} & NhPrecinctSplitOptions) {
  const ballotTitles: Record<BallotMode, Record<BallotType, JSX.Element>> = {
    official: {
      [BallotType.Precinct]: hmpbStrings.hmpbOfficialBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbOfficialAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbOfficialProvisionalBallot,
    },
    sample: {
      [BallotType.Precinct]: hmpbStrings.hmpbSampleBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbSampleAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbSampleProvisionalBallot,
    },
    test: {
      [BallotType.Precinct]: hmpbStrings.hmpbTestBallot,
      [BallotType.Absentee]: hmpbStrings.hmpbTestAbsenteeBallot,
      [BallotType.Provisional]: hmpbStrings.hmpbTestProvisionalBallot,
    },
  };
  const ballotTitle = ballotTitles[ballotMode][ballotType];

  const party =
    election.type === 'primary'
      ? assertDefined(getPartyForBallotStyle({ election, ballotStyleId }))
      : undefined;

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          height: '5rem',
          aspectRatio: '1 / 1',
          backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
            electionSealOverride ?? election.seal
          ).toString('base64')})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          marginTop: '0.125rem',
        }}
      />
      <div style={{ flexGrow: 2 }}>
        <DualLanguageText>
          <div>
            <h1>{ballotTitle}</h1>
            {party && <h1>{electionStrings.partyFullName(party)}</h1>}
            <h2>
              {electionTitleOverride ?? electionStrings.electionTitle(election)}
            </h2>
            <h2>{electionStrings.electionDate(election)}</h2>
            <div>
              {/* TODO comma-delimiting the components of a location doesn't
            necessarily work in all languages. We need to figure out a
            language-aware way to denote hierarchical locations. */}
              {electionStrings.countyName(election.county)},{' '}
              {electionStrings.stateName(election)}
            </div>
          </div>
        </DualLanguageText>
      </div>
      <div style={{ flexGrow: 1 }}>
        {clerkSignatureImage && (
          <div
            style={{
              height: '3rem',
              backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
                clerkSignatureImage
              ).toString('base64')})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              marginTop: '0.125rem',
              visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
            }}
          />
        )}
        {clerkSignatureCaption && (
          <div
            style={{
              visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
            }}
          >
            {clerkSignatureCaption}
          </div>
        )}
      </div>
    </div>
  );
}

// Almost identical to vx_default_ballot_template BallotPageFrame except additional props are passed to Header.
function BallotPageFrame({
  election,
  ballotStyleId,
  compact,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  electionTitleOverride,
  electionSealOverride,
  clerkSignatureImage,
  clerkSignatureCaption,
  watermark,
  colorTint,
}: NhBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): JSX.Element {
  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const languageCode = primaryLanguageCode(ballotStyle);
  // There are a number of places in the design and implementation of this
  // template that haven't yet been extended to support translations and
  // dual-language ballots (e.g. the header layout, the logic to split long
  // ballot measures across pages).
  assert(
    (!ballotStyle.languages || ballotStyle.languages.length === 1) &&
      languageCode === LanguageCode.ENGLISH,
    'NH ballot template only supports English'
  );
  return (
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
        <TimingMarkGrid pageDimensions={pageDimensions}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? '0.5rem' : '0.75rem',
              padding: '0.125in',
            }}
          >
            {pageNumber === 1 && (
              <>
                <Header
                  election={election}
                  ballotStyleId={ballotStyleId}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  electionTitleOverride={electionTitleOverride}
                  electionSealOverride={electionSealOverride}
                  clerkSignatureImage={clerkSignatureImage}
                  clerkSignatureCaption={clerkSignatureCaption}
                />
                <Instructions
                  colorTint={colorTint}
                  languageCode={languageCode}
                />
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
            <Footer
              election={election}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              pageNumber={pageNumber}
              totalPages={totalPages}
              colorTint={colorTint}
            />
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
        <DualLanguageText delimiter="/">
          <h3>{electionStrings.contestTitle(contest)}</h3>
        </DualLanguageText>
        <DualLanguageText delimiter="/">
          <div>{voteForText}</div>
        </DualLanguageText>
        {willBeElectedText && (
          <DualLanguageText delimiter="/">
            <div>{willBeElectedText}</div>
          </DualLanguageText>
        )}
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            <div>{electionStrings.contestTerm(contest)}</div>
          </DualLanguageText>
        )}
      </ContestHeader>
      <ul>
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
            <li
              key={candidate.id}
              style={{
                padding: '0.375rem 0.5rem',
                borderTop:
                  i !== 0 ? `1px solid ${Colors.DARK_GRAY}` : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                }}
              >
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <strong>{candidate.name}</strong>
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
                  gap: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  paddingTop: '0.9rem',
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      borderBottom: `1px solid ${Colors.BLACK}`,
                      height: '1.25rem',
                    }}
                  />
                  <div style={{ fontSize: '0.8rem' }}>
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
  continuesOnNextPage,
}: {
  contest: YesNoContest;
  compact?: boolean;
  colorTint?: ColorTint;
  continuesOnNextPage?: boolean;
}) {
  const ContestTitle = compact ? 'h3' : 'h2';

  return (
    <Box style={{ padding: 0 }}>
      <ContestHeader colorTint={colorTint}>
        <DualLanguageText delimiter="/">
          <ContestTitle>{contest.title}</ContestTitle>
        </DualLanguageText>
      </ContestHeader>
      <div
        style={{
          display: 'flex',
          flexDirection: compact && !continuesOnNextPage ? 'row' : 'column',
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
              {/* The logic to split long ballot measures across pages
              manipulates `contest.description`, but doesn't change
              `Election.ballotStrings`, so we can't use the usual
              `electionStrings.contestDescription(contest)` here, since that
              relies on `ballotStrings`. Since we currently only support English
              ballots, that's ok. However, if we ever support multiple
              languages, we'll need to revisit this. */}
              <div
                className="contestDescription"
                dangerouslySetInnerHTML={{ __html: contest.description }}
              />
            </RichText>
          </DualLanguageText>
        </div>
        {continuesOnNextPage ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '0.375rem 0.5rem',
              borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
              backgroundColor: Colors.LIGHT_GRAY,
            }}
          >
            <h4
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              Continues on next page{' '}
              <ArrowRightCircle style={{ height: '1rem' }} />
            </h4>
          </div>
        ) : (
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
        )}
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

async function splitLongBallotMeasureAcrossPages(
  tooLongContest: YesNoContest,
  contestProps: Omit<Parameters<typeof Contest>[0], 'contest'>,
  ballotStyle: BallotStyle,
  dimensions: PixelDimensions,
  scratchpad: RenderScratchpad
) {
  const columnWidthPx = dimensions.width;
  const contestElement = (
    <BackendLanguageContextProvider
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={contestProps.election.ballotStrings}
    >
      <div className="contestWrapper" style={{ width: `${columnWidthPx}px` }}>
        <Contest {...contestProps} contest={tooLongContest} />
      </div>
    </BackendLanguageContextProvider>
  );
  const [contestMeasurements] = await scratchpad.measureElements(
    contestElement,
    '.contestWrapper'
  );
  const childMeasurements = await scratchpad.measureElements(
    contestElement,
    '.contestDescription > *'
  );
  const contestFooterHeight = 30; // "Continues on next page" caption
  const firstOverflowingChildIndex = childMeasurements.findIndex(
    (child) =>
      child.y - contestMeasurements.y + child.height + contestFooterHeight >=
      dimensions.height
  );
  assert(firstOverflowingChildIndex !== -1, 'No overflowing child found');
  const descriptionHtmlNode = parseHtml(tooLongContest.description);
  for (const overflowingChild of descriptionHtmlNode.childNodes.slice(
    firstOverflowingChildIndex
  )) {
    descriptionHtmlNode.removeChild(overflowingChild);
  }
  const splitIndex = descriptionHtmlNode.toString().length;

  const firstDescriptionChunk = tooLongContest.description.slice(0, splitIndex);
  const firstContest: YesNoContest = {
    ...tooLongContest,
    description: firstDescriptionChunk,
  };
  const firstContestElement = (
    <BallotMeasureContest
      {...contestProps}
      contest={firstContest}
      continuesOnNextPage
    />
  );

  const restDescription = tooLongContest.description.slice(splitIndex);
  const continuedTitleSuffix = ' (Continued)';
  const continuedTitle = tooLongContest.title.endsWith(continuedTitleSuffix)
    ? tooLongContest.title
    : `${tooLongContest.title}${continuedTitleSuffix}`;
  const restContest: YesNoContest = {
    ...tooLongContest,
    title: continuedTitle,
    description: restDescription,
  };

  return {
    firstContestElement,
    restContest,
  };
}

async function BallotPageContent(
  props: (NhBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<NhBallotProps>> {
  if (!props) {
    return ok({
      currentPageElement: <BlankPageMessage />,
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
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Add as many contests on this page as will fit.
  const pageSections: JSX.Element[] = [];
  let heightUsed = 0;

  // TODO is there some way we can use rem here instead of having to know the
  // font size and map to px?
  const horizontalGapPx = (compact ? 0.5 : 0.75) * 16; // Assuming 16px per 1rem
  const verticalGapPx = horizontalGapPx;
  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSections.shift());
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
            style={{ width: `${columnWidthPx}px` }}
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
      contestSections.unshift(section.slice(numElementsUsed));
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
        style={{ display: 'flex', gap: `${horizontalGapPx}px` }}
      >
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalGapPx}px`,
            }}
          >
            {column.map(({ element }) => element)}
          </div>
        ))}
      </div>
    );
  }

  const contestsLeftToLayout = contestSections.flat();
  if (contests.length > 0 && contestsLeftToLayout.length === contests.length) {
    const tooLongContest = assertDefined(contestsLeftToLayout.shift());
    if (tooLongContest.type === 'yesno') {
      const { firstContestElement, restContest } =
        await splitLongBallotMeasureAcrossPages(
          tooLongContest,
          { election, compact, colorTint: props.colorTint },
          ballotStyle,
          dimensions,
          scratchpad
        );
      pageSections.push(<div key="section-1">{firstContestElement}</div>);
      contestsLeftToLayout.unshift(restContest);
    } else {
      return err({
        error: 'contestTooLong',
        contest: tooLongContest,
      });
    }
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
      <BlankPageMessage />
    );
  const nextPageProps =
    contestsLeftToLayout.length > 0
      ? {
          ...restProps,
          compact,
          ballotStyleId,
          election: {
            ...election,
            contests: contestsLeftToLayout,
          },
        }
      : undefined;

  return ok({
    currentPageElement,
    nextPageProps,
  });
}

export type NhBallotProps = BaseBallotProps &
  NhPrecinctSplitOptions & { colorTint?: ColorTint };

export const nhBallotTemplate: BallotPageTemplate<NhBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
