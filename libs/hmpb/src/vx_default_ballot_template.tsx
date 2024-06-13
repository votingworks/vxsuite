import React from 'react';
import {
  assertDefined,
  iter,
  range,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import { Buffer } from 'buffer';
import styled from 'styled-components';
import {
  AnyContest,
  BallotStyle,
  BallotStyleId,
  BallotType,
  CandidateContest as CandidateContestStruct,
  Election,
  LanguageCode,
  PrecinctId,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getPartyForBallotStyle,
  getPrecinctById,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  CandidatePartyList,
  InEnglish,
  appStrings,
  electionStrings,
  useLanguageContext,
} from '@votingworks/ui';
import { extractBallotStyleGroupId, format } from '@votingworks/utils';
import {
  BallotPageTemplate,
  BaseBallotProps,
  PagedElementResult,
} from './render_ballot';
import { RenderScratchpad } from './renderer';
import {
  Bubble,
  ElectionHashSlot,
  OptionInfo,
  Page,
  QrCodeSlot,
  TimingMarkGrid,
  WRITE_IN_OPTION_CLASS,
  pageMarginsInches,
} from './ballot_components';
import { BallotMode, PixelDimensions } from './types';
import {
  ArrowRightCircle,
  InstructionsDiagramFillBubble,
  InstructionsDiagramWriteIn,
} from './svg_assets';
import { layOutInColumns } from './layout_in_columns';

const Colors = {
  BLACK: '#000000',
  LIGHT_GRAY: '#EDEDED',
  DARK_GRAY: '#DADADA',
} as const;

function primaryLanguageCode(ballotStyle: BallotStyle): LanguageCode {
  return ballotStyle.languages?.[0] ?? LanguageCode.ENGLISH;
}

/**
 * Flex row that adds delimiters between each child element. However, if a child
 * element wraps to the next line, omits the delimiter before that element.
 */
const DelimitedOrWrapped = styled.div<{ delimiter: string }>`
  display: flex;
  flex-wrap: wrap;
  /* Hide the overflow of the container so that a child's delimiter is hidden if
   * the child is at the beginning of a line */
  overflow: hidden;
  position: relative;

  /* Add delimiter before each child */
  > *:before {
    content: '${(p) => p.delimiter}';
    /* Absolute position takes it out of the flow so it can overflow to the left
     * of the container */
    position: absolute;
    margin-left: -0.8em;
    /* Use a fixed width that's based on the font size of the children */
    width: 0.8em;
    text-align: center;
  }
  /* Create a space between the children for the delimiter to go */
  > *:not(:last-child) {
    margin-right: 0.8em;
  }
`;

function DualLanguageText({
  children,
  delimiter,
}: {
  children: React.ReactNode;
  delimiter?: string;
}) {
  const languageContext = useLanguageContext();
  if (
    !languageContext ||
    languageContext.currentLanguageCode === LanguageCode.ENGLISH
  ) {
    return children;
  }

  const text = (
    <React.Fragment>
      {children}
      <InEnglish>{children}</InEnglish>
    </React.Fragment>
  );

  if (delimiter) {
    return (
      <DelimitedOrWrapped delimiter={delimiter}>{text}</DelimitedOrWrapped>
    );
  }
  return text;
}

const Box = styled.div<{ fill?: 'transparent' | 'tinted' }>`
  border: 1px solid ${Colors.BLACK};
  border-top-width: 3px;
  padding: 0.75rem;
  background-color: ${(p) =>
    p.fill === 'tinted' ? Colors.LIGHT_GRAY : 'none'};
`;

function Header({
  election,
  ballotStyleId,
  ballotType,
  ballotMode,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
}) {
  const ballotTitles: Record<BallotMode, Record<BallotType, JSX.Element>> = {
    official: {
      [BallotType.Precinct]: appStrings.hmpbOfficialBallot(),
      [BallotType.Absentee]: appStrings.hmpbOfficialAbsenteeBallot(),
      [BallotType.Provisional]: appStrings.hmpbOfficialProvisionalBallot(),
    },
    sample: {
      [BallotType.Precinct]: appStrings.hmpbSampleBallot(),
      [BallotType.Absentee]: appStrings.hmpbSampleAbsenteeBallot(),
      [BallotType.Provisional]: appStrings.hmpbSampleProvisionalBallot(),
    },
    test: {
      [BallotType.Precinct]: appStrings.hmpbTestBallot(),
      [BallotType.Absentee]: appStrings.hmpbTestAbsenteeBallot(),
      [BallotType.Provisional]: appStrings.hmpbTestProvisionalBallot(),
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
            election.seal
          ).toString('base64')})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          marginTop: '0.125rem',
        }}
      />
      <DualLanguageText>
        <div>
          <h1>{ballotTitle}</h1>
          {party && <h1>{electionStrings.partyFullName(party)}</h1>}
          <h2>{electionStrings.electionTitle(election)}</h2>
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
  );
}

function WriteInLabel() {
  return (
    <span>
      {appStrings.hmpbWriteIn()} /{' '}
      <InEnglish>{appStrings.hmpbWriteIn()}</InEnglish>
    </span>
  );
}

function Instructions({ languageCode }: { languageCode?: LanguageCode }) {
  // To minimize vertical space used, we do a slightly different layout for
  // English-only vs bilingual ballots.
  if (!languageCode || languageCode === LanguageCode.ENGLISH) {
    return (
      <Box
        fill="tinted"
        style={{
          padding: '0.5rem 0.5rem',
          display: 'grid',
          gap: '0.125rem 0.75rem',
          gridTemplateColumns: '1fr 7rem 1.8fr 8rem',
        }}
      >
        <div>
          <h2>{appStrings.hmpbInstructions()}</h2>
          <h4>{appStrings.hmpbInstructionsToVoteTitle()}</h4>
          <div>{appStrings.hmpbInstructionsToVoteText()}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <InstructionsDiagramFillBubble />
        </div>

        <div>
          <h4>{appStrings.hmpbInstructionsWriteInTitle()}</h4>
          <div>{appStrings.hmpbInstructionsWriteInText()}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <InstructionsDiagramWriteIn writeInLabel={<WriteInLabel />} />
        </div>
      </Box>
    );
  }

  return (
    <Box
      fill="tinted"
      style={{
        padding: '0.5rem 0.5rem',
        display: 'grid',
        gap: '0.125rem 0.75rem',
        gridTemplateColumns: '7.5rem 1fr 1fr',
      }}
    >
      {/* Row 1 */}
      <div />
      <DualLanguageText>
        <h2>{appStrings.hmpbInstructions()}</h2>
      </DualLanguageText>

      {/* Row 2 */}
      <div style={{ alignSelf: 'center' }}>
        <InstructionsDiagramFillBubble />
      </div>
      <DualLanguageText>
        <div>
          <b>{appStrings.hmpbInstructionsToVoteTitle()}</b>
          <div>{appStrings.hmpbInstructionsToVoteText()}</div>
        </div>
      </DualLanguageText>

      {/* Row 3 */}
      <div style={{ alignSelf: 'center' }}>
        <InstructionsDiagramWriteIn writeInLabel={<WriteInLabel />} />
      </div>
      <DualLanguageText>
        <div>
          <b>{appStrings.hmpbInstructionsWriteInTitle()}</b>
          <div>{appStrings.hmpbInstructionsWriteInText()}</div>
        </div>
      </DualLanguageText>
    </Box>
  );
}

export function Footer({
  election,
  ballotStyleId,
  precinctId,
  pageNumber,
  totalPages,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  pageNumber: number;
  totalPages: number;
}): JSX.Element {
  const precinct = assertDefined(getPrecinctById({ election, precinctId }));
  const languageCode = primaryLanguageCode(
    assertDefined(getBallotStyle({ election, ballotStyleId }))
  );
  const languageText = unique([languageCode, LanguageCode.ENGLISH])
    .map((code) =>
      format.languageDisplayName({
        languageCode: code,
        displayLanguageCode: LanguageCode.ENGLISH,
      })
    )
    .join(' / ');

  const continueVoting = (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'right' }}>
        <DualLanguageText>
          <h3>
            {pageNumber % 2 === 1
              ? appStrings.hmpbContinueVotingOnBack()
              : appStrings.hmpbContinueVotingOnNextSheet()}
          </h3>
        </DualLanguageText>
      </div>
      <ArrowRightCircle style={{ height: '2rem' }} />
    </div>
  );
  const ballotComplete = (
    <div style={{ textAlign: 'right' }}>
      <DualLanguageText>
        <h3>{appStrings.hmpbVotingComplete()}</h3>
      </DualLanguageText>
    </div>
  );
  const endOfPageInstruction =
    pageNumber === totalPages ? ballotComplete : continueVoting;

  return (
    <div>
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
            <div style={{ fontSize: '0.85rem' }}>
              <DualLanguageText delimiter="/">
                {appStrings.hmpbPage()}
              </DualLanguageText>
            </div>
            <h1>
              {pageNumber}/{totalPages}
            </h1>
          </div>
          <div>{endOfPageInstruction}</div>
        </Box>
      </div>
      {pageNumber % 2 === 1 && (
        <div
          style={{
            fontSize: '8pt',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.5rem',
            borderWidth: '1px',
            marginTop: '0.325rem',
            // There's padding at the bottom of the timing mark grid that we
            // want to eat into a little bit here, so we set a height that's
            // slightly smaller than the actual height of this text and let it
            // overflow a bit.
            height: '0.5rem',
          }}
        >
          <span>
            Election:{' '}
            <b>
              <ElectionHashSlot />
            </b>
          </span>
          <span>
            Ballot Style: <b>{extractBallotStyleGroupId(ballotStyleId)}</b>
          </span>
          <span>
            Precinct: <b>{precinct.name}</b>
          </span>
          <span>
            Language: <b>{languageText}</b>
          </span>
        </div>
      )}
    </div>
  );
}

function BallotPageFrame({
  election,
  translatedStrings,
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
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const languageCode = primaryLanguageCode(ballotStyle);
  return (
    <BackendLanguageContextProvider
      key={pageNumber}
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={translatedStrings}
    >
      <Page
        pageNumber={pageNumber}
        dimensions={pageDimensions}
        margins={pageMarginsInches}
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
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                />
                <Instructions languageCode={languageCode} />
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
            />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

const ContestHeader = styled.div`
  background: ${Colors.LIGHT_GRAY};
  padding: 0.5rem 0.5rem;
`;

function CandidateContest({
  election,
  contest,
}: {
  election: Election;
  contest: CandidateContestStruct;
}) {
  const voteForText = {
    1: appStrings.hmpbVoteFor1(),
    2: appStrings.hmpbVoteFor2(),
    3: appStrings.hmpbVoteFor3(),
    4: appStrings.hmpbVoteFor4(),
    5: appStrings.hmpbVoteFor5(),
    6: appStrings.hmpbVoteFor6(),
    7: appStrings.hmpbVoteFor7(),
    8: appStrings.hmpbVoteFor8(),
    9: appStrings.hmpbVoteFor9(),
    10: appStrings.hmpbVoteFor10(),
  }[contest.seats];
  if (!voteForText) {
    throw new Error(
      `Unsupported number of seats for contest: ${contest.seats}`
    );
  }

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
      }}
    >
      <ContestHeader>
        <DualLanguageText delimiter="/">
          <h3>{electionStrings.contestTitle(contest)}</h3>
        </DualLanguageText>
        <DualLanguageText delimiter="/">{voteForText}</DualLanguageText>
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            {electionStrings.contestTerm(contest)}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '1.2rem', // Match line-height of text to align bubble to center of first line of candidate name
                  }}
                >
                  <Bubble optionInfo={optionInfo} />
                </div>
                <div>
                  <strong>{candidate.name}</strong>
                  {partyText && (
                    <DualLanguageText delimiter="/">
                      <div>{partyText}</div>
                    </DualLanguageText>
                  )}
                </div>
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
                top: 0.8,
                left: -0.9,
                bottom: 0.2,
                right: 8.7,
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '1.25rem', // Match height of write-in box below to align bubble to center of box
                  }}
                >
                  <Bubble optionInfo={optionInfo} />
                </div>
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
        <DualLanguageText delimiter="/">
          <h2>{electionStrings.contestTitle(contest)}</h2>
        </DualLanguageText>
      </ContestHeader>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.25rem',
        }}
      >
        <div
          style={{
            padding: '0.5rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <DualLanguageText>
            <div>{electionStrings.contestDescription(contest)}</div>
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
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '1.2rem', // Match line-height of text to align bubble to center of first line of option label
                  }}
                >
                  <Bubble
                    optionInfo={{
                      type: 'option',
                      contestId: contest.id,
                      optionId: option.id,
                    }}
                  />
                </div>
                <strong>
                  <DualLanguageText delimiter="/">
                    {electionStrings.contestOptionLabel(option)}
                  </DualLanguageText>
                </strong>
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
      <div style={{ textAlign: 'center' }}>
        <DualLanguageText>
          <h1>{appStrings.hmpbPageIntentionallyBlank()}</h1>
        </DualLanguageText>
      </div>
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
      <BackendLanguageContextProvider
        currentLanguageCode={primaryLanguageCode(ballotStyle)}
        uiStringsPackage={restProps.translatedStrings}
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
      .toArray();

    const { columns, height, leftoverElements } = layOutInColumns({
      elements: measuredContests,
      numColumns,
      maxColumnHeight: dimensions.height - heightUsed,
      // Use the same spacing as the column gutter for vertical spacing between
      // contests
      elementGap: gutterWidthPx,
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
