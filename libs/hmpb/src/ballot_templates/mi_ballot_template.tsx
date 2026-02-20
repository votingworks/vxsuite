import React from 'react';
import {
  assert,
  assertDefined,
  err,
  groupBy,
  ok,
  range,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotMode,
  BallotStyle,
  BallotStyleId,
  BaseBallotProps,
  CandidateContest as CandidateContestStruct,
  DistrictContest,
  Election,
  PrecinctId,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  CandidatePartyList,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import styled from 'styled-components';
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
  DualLanguageText,
  primaryLanguageCode,
  Footer,
  Colors,
  BlankPageMessage,
  AlignedBubble,
  ContestTitle,
  CANDIDATE_OPTION_CLASS,
  BALLOT_MEASURE_OPTION_CLASS,
  StraightPartyContestContent,
  PrecinctOrSplitName,
} from '../ballot_components';
import { PixelDimensions } from '../types';
import {
  layOutSectionsInColumns,
  layoutSectionsInParallelColumns,
} from '../layout_in_columns';
import { hmpbStrings } from '../hmpb_strings';
import { Watermark } from './watermark';
import { BaseStyles as BaseStylesComponent } from '../base_styles';
import { ArrowDown } from '../svg_assets';

const Box = styled.div<{
  fill?: 'transparent' | 'tinted';
}>`
  border: 1px solid ${Colors.BLACK};
  // border-top-width: 3px;
  background-color: ${(p) =>
    p.fill === 'tinted' ? Colors.LIGHT_GRAY : 'none'};
  &:not(:first-child) {
    border-top: none;
  }
`;

const ContestColumn = styled.div`
  &:not(:first-child) {
    > ${Box} {
      margin-left: -1px;
    }
  }
`;

function BaseStyles(): JSX.Element {
  return <BaseStylesComponent compact />;
}

// Section header (Partisan, Nonpartisan and Proposal): 60% fill, centered, bold face, upper and lower case,
// white sans serif font, 11 pt.
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box
      style={{
        background: Colors.INVERSE_GRAY,
        color: Colors.WHITE,
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '11pt',
        padding: '0.25rem 0.5rem',
      }}
    >
      {children}
    </Box>
  );
}

function PartySectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box
      style={{
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '11pt',
        padding: '0.25rem 0.5rem',
      }}
    >
      {children}
    </Box>
  );
}

// Divisional header (i.e. Congressional, Village): 40% fill, centered, bold face, upper and lower case, black
// sans serif font, 10.5 pt.
function DivisionalHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box
      style={{
        background: 'hsl(0, 2%, 75%)',
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '11pt',
        padding: '0.25rem 0.5rem',
      }}
    >
      {children}
    </Box>
  );
}

// Race/Office header: 20% fill, centered, bold face, upper and lower case, black sans serif font, 9.5 pt.
function ContestHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: Colors.LIGHT_GRAY,
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '10pt',
        padding: '0.25rem 0.5rem',
      }}
    >
      {children}
    </div>
  );
}

// Vote for statement: 20% fill, centered, regular face, upper and lower case, black or red sans serif font, 8 pt.
function VoteFor({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textAlign: 'center',
        fontWeight: 'normal',
        fontSize: '8pt',
      }}
    >
      {children}
    </div>
  );
}

// Candidate Name: 0% fill, justified, bold face, upper and lower case, black sans serif font, 9 pt.
function CandidateName({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>{children}</div>;
}

// Party Affiliation/Formerly known: 0% fill, justified, regular face, upper and lower case, black sans serif font,
// 8 pt.
function CandidateDetails({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '8pt' }}>{children}</div>;
}

// Proposal wording: 0% fill, left justified, regular face, upper and lower case, black sans serif font, 8.5 pt.
function ProposalDescription({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '9pt' }}>{children}</div>;
}

function Header({
  election,
  ballotStyleId,
  precinctId,
  ballotMode,
}: {
  election: Election;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  ballotMode: BallotMode;
}) {
  const ballotTitles: Record<BallotMode, JSX.Element> = {
    official: hmpbStrings.hmpbOfficialBallot,
    sample: hmpbStrings.hmpbSampleBallot,
    test: hmpbStrings.hmpbTestBallot,
  };
  const ballotTitle = ballotTitles[ballotMode];

  // const party =
  //   election.type === 'primary'
  //     ? assertDefined(getPartyForBallotStyle({ election, ballotStyleId }))
  //     : undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12pt',
        fontWeight: 'bold',
      }}
    >
      <DualLanguageText>
        <div style={{ fontSize: '1.2em', textTransform: 'uppercase' }}>
          {ballotTitle}
        </div>
        {/* {party && <div>{electionStrings.partyFullName(party)} Ballot</div>} */}
        <div>{electionStrings.electionTitle(election)}</div>
        <div>{electionStrings.electionDate(election)}</div>
        <div>
          {/* TODO comma-delimiting the components of a location doesn't
            necessarily work in all languages. We need to figure out a
            language-aware way to denote hierarchical locations. */}
          {electionStrings.countyName(election.county)},{' '}
          {electionStrings.stateName(election)}
        </div>
        <PrecinctOrSplitName
          election={election}
          precinctId={precinctId}
          ballotStyleId={ballotStyleId}
        />
      </DualLanguageText>
    </div>
  );
}

function BallotPageFrame({
  election,
  ballotStyleId,
  precinctId,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  watermark,
}: BaseBallotProps & {
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
                  ballotMode={ballotMode}
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
            <div style={{ fontSize: '12pt' }}>
              <Footer
                election={election}
                ballotStyleId={ballotStyleId}
                precinctId={precinctId}
                pageNumber={pageNumber}
                totalPages={totalPages}
              />
            </div>
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

function CandidateContest({
  election,
  contest,
  ballotStyle,
}: {
  election: Election;
  contest: CandidateContestStruct;
  ballotStyle: BallotStyle;
}) {
  const candidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });
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
          <div>{electionStrings.contestTitle(contest)}</div>
        </DualLanguageText>
        <DualLanguageText delimiter="/">
          <VoteFor>{voteForText}</VoteFor>
        </DualLanguageText>
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            <div>{electionStrings.contestTerm(contest)}</div>
          </DualLanguageText>
        )}
      </ContestHeader>
      <ul>
        {candidates.map((candidate, i) => {
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
            partyIds: candidate.partyIds,
          };
          return (
            <li
              key={candidate.id}
              className={CANDIDATE_OPTION_CLASS}
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
                <AlignedBubble optionInfo={optionInfo} />
                <div>
                  <CandidateName>
                    {electionStrings.candidateName(candidate)}
                  </CandidateName>
                  {partyText && (
                    <DualLanguageText delimiter="/">
                      <CandidateDetails>{partyText}</CandidateDetails>
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
                top: 0.5,
                left: -0.6,
                bottom: 0.5,
                right: 6.8,
              },
            };
            return (
              <li
                key={writeInIndex}
                className={WRITE_IN_OPTION_CLASS}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.5rem 0.5rem',
                  // paddingTop: '0.9rem',
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                }}
              >
                <AlignedBubble optionInfo={optionInfo} />
                {/* <div style={{ flex: 1 }}>
                  <div
                    style={{
                      borderBottom: `1px solid ${Colors.BLACK}`,
                      height: '1.25rem',
                    }}
                  />
                </div> */}
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
          <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
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
          <ProposalDescription>
            <DualLanguageText>
              <RichText
                tableBorderWidth={'1px'}
                tableBorderColor={Colors.DARKER_GRAY}
                tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
              >
                {electionStrings.contestDescription(contest)}
              </RichText>
            </DualLanguageText>
          </ProposalDescription>
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
              className={BALLOT_MEASURE_OPTION_CLASS}
              style={{
                padding: '0.375rem 0.5rem',
                borderTop: `1px solid ${Colors.LIGHT_GRAY}`,
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <AlignedBubble
                  optionInfo={{
                    type: 'option',
                    contestId: contest.id,
                    optionId: option.id,
                  }}
                />
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
  ballotStyle,
}: {
  contest: AnyContest;
  election: Election;
  ballotStyle: BallotStyle;
}) {
  switch (contest.type) {
    case 'candidate':
      return (
        <CandidateContest
          election={election}
          contest={contest}
          ballotStyle={ballotStyle}
        />
      );
    case 'yesno':
      return <BallotMeasureContest contest={contest} />;
    case 'straight-party':
      return (
        <Box style={{ padding: 0 }}>
          <ContestHeader>
            <div>{contest.title}</div>
            <DualLanguageText delimiter="/">
              <VoteFor>
                {hmpbStrings.hmpbVoteForNotMoreThan1}
              </VoteFor>
            </DualLanguageText>
          </ContestHeader>
          <StraightPartyContestContent
            contest={contest}
            election={election}
          />
        </Box>
      );
    default:
      return throwIllegalValue(contest);
  }
}

async function PrimaryBallotPageContent(
  props: BaseBallotProps & { dimensions: PixelDimensions },
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<BaseBallotProps>> {
  const { election, ballotStyleId, dimensions, ...restProps } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const contests = election.contests.filter(
    (c): c is DistrictContest =>
      c.type !== 'straight-party' && ballotStyle.districts.includes(c.districtId)
  );
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }

  const contestSections = [
    {
      header: 'Democratic Party Section',
      contests: contests.filter(
        (contest) =>
          contest.type === 'candidate' && contest.partyId === 'democratic'
      ),
    },
    {
      header: 'Republican Party Section',
      contests: contests.filter(
        (contest) =>
          contest.type === 'candidate' && contest.partyId === 'republican'
      ),
    },
    {
      header: 'Libertarian Party<br/>Section',
      contests: contests.filter(
        (contest) =>
          contest.type === 'candidate' && contest.partyId === 'libertarian'
      ),
    },
    {
      header: 'Nonpartisan Section',
      contests: contests.filter(
        (contest) => contest.type === 'candidate' && !contest.partyId
      ),
    },
    {
      header: 'Proposal Section',
      contests: contests.filter((contest) => contest.type === 'yesno'),
    },
  ]
    .filter((section) => section.contests.length > 0)
    .map((section) => ({
      header: section.header,
      subsections: groupBy(
        section.contests,
        (contest) => contest.districtId
      ).map(([districtId, districtContests]) => ({
        header: assertDefined(
          election.districts.find((d) => d.id === districtId)
        ).name,
        contests: districtContests,
      })),
    }));

  const horizontalGapPx = 0;
  const verticalGapPx = 0;

  const numColumns = 4;
  const columnWidthPx =
    (dimensions.width - horizontalGapPx * (numColumns - 1)) / numColumns;

  const sectionElements = contestSections.map((section) => ({
    header: section.header.includes('Party') ? (
      <PartySectionHeader>
        <span dangerouslySetInnerHTML={{ __html: section.header }} />
      </PartySectionHeader>
    ) : (
      <SectionHeader>{section.header}</SectionHeader>
    ),
    subsections: section.subsections.map((subsection) => ({
      header:
        subsection.header !== undefined ? (
          <DivisionalHeader>{subsection.header}</DivisionalHeader>
        ) : undefined,
      contests: subsection.contests.map((contest) => ({
        contest,
        element: (
          <Contest
            key={contest.id}
            contest={contest}
            election={election}
            ballotStyle={ballotStyle}
          />
        ),
      })),
    })),
  }));

  const flattenedElements = sectionElements.flatMap((section) => {
    const subsectionElements = section.subsections.flatMap((subsection) => [
      ...(subsection.header ? [subsection.header] : []),
      ...subsection.contests.map(({ element }) => element),
    ]);
    return [section.header, ...subsectionElements];
  });

  const measurements = await scratchpad.measureElements(
    <BackendLanguageContextProvider
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={election.ballotStrings}
    >
      {flattenedElements.map((element, i) => (
        <div
          className="wrapper"
          key={i}
          style={{ width: `${columnWidthPx}px` }}
        >
          {element}
        </div>
      ))}
    </BackendLanguageContextProvider>,
    '.wrapper'
  );
  const measurementsQueue = measurements.toReversed();

  const measuredSections = [];
  for (const sectionElement of sectionElements) {
    const sectionHeaderMeasurements = assertDefined(measurementsQueue.pop());
    const measuredSubsections = [];
    for (const subsectionElement of sectionElement.subsections) {
      const subsectionHeaderMeasurements =
        subsectionElement.header && assertDefined(measurementsQueue.pop());
      const measuredContests = [];
      for (const contestElement of subsectionElement.contests) {
        const contestMeasurements = assertDefined(measurementsQueue.pop());
        measuredContests.push({
          ...contestElement,
          ...contestMeasurements,
        });
      }
      measuredSubsections.push({
        header: subsectionElement.header && {
          element: subsectionElement.header,
          ...assertDefined(subsectionHeaderMeasurements),
        },
        elements: measuredContests,
      });
    }
    measuredSections.push({
      header: {
        element: sectionElement.header,
        ...sectionHeaderMeasurements,
      },
      subsections: measuredSubsections,
    });
  }

  const partisanSectionHeader = (
    <SectionHeader>
      Partisan Section - Vote Only 1 Party Selection
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1 }}>
          <ArrowDown style={{ height: '3rem' }} />
        </div>
        <div style={{ flex: 1 }}>
          <ArrowDown style={{ height: '3rem' }} />
        </div>
        <div style={{ flex: 1 }}>
          <ArrowDown style={{ height: '3rem' }} />
        </div>
      </div>
    </SectionHeader>
  );

  const [partisanSectionHeaderMeasurements] = await scratchpad.measureElements(
    <BackendLanguageContextProvider
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={election.ballotStrings}
    >
      <div
        style={{ width: `${columnWidthPx * 3 + horizontalGapPx * 2}px` }}
        className="wrapper"
      >
        {partisanSectionHeader}
      </div>
    </BackendLanguageContextProvider>,
    '.wrapper'
  );
  const partisanSectionHeaderHeight = partisanSectionHeaderMeasurements.height;

  const partisanSections = measuredSections.slice(0, 3);
  const nonPartisanSections = measuredSections.slice(3);
  const {
    columns: partisanColumns,
    leftoverSections: leftoverPartisanSections,
  } = layoutSectionsInParallelColumns({
    sections: partisanSections,
    maxColumnHeight: dimensions.height - partisanSectionHeaderHeight,
    elementGap: verticalGapPx,
  });

  const {
    columns: nonPartisanColumns,
    leftoverSections: leftoverNonpartisanSections,
  } = layOutSectionsInColumns({
    sections: nonPartisanSections,
    numColumns: 1,
    maxColumnHeight: dimensions.height,
    elementGap: verticalGapPx,
  });

  const sectionsElement = (
    <div style={{ display: 'flex', gap: `${horizontalGapPx}px` }}>
      <div style={{ width: '75%' }}>
        {partisanSectionHeader}
        <div style={{ display: 'flex', gap: `${horizontalGapPx}px` }}>
          {partisanColumns.map((column, i) => (
            <ContestColumn
              key={`column-${i}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: `${verticalGapPx}px`,
              }}
            >
              {column.map(({ element }) => element)}
            </ContestColumn>
          ))}
        </div>
      </div>
      <div style={{ width: '25%' }}>
        <div />
        {nonPartisanColumns.map((column, i) => (
          <ContestColumn
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalGapPx}px`,
            }}
          >
            {column.map(({ element }) => element)}
          </ContestColumn>
        ))}
      </div>
    </div>
  );

  const contestsLeftToLayout = [
    ...leftoverPartisanSections,
    ...leftoverNonpartisanSections,
  ].flatMap((section) =>
    section.subsections.flatMap((subsection) =>
      subsection.elements.map((c) => {
        assert('contest' in c);
        return c.contest as AnyContest;
      })
    )
  );

  if (contests.length > 0 && contestsLeftToLayout.length === contests.length) {
    return err({
      error: 'contestTooLong',
      contest: contestsLeftToLayout[0],
    });
  }

  const currentPageElement =
    contestsLeftToLayout.length === contests.length ? (
      <BlankPageMessage />
    ) : (
      sectionsElement
    );

  const nextPageProps =
    contestsLeftToLayout.length > 0
      ? {
          ...restProps,
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

async function BallotPageContent(
  props: (BaseBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<BaseBallotProps>> {
  if (!props) {
    return ok({
      currentPageElement: <BlankPageMessage />,
      nextPageProps: undefined,
    });
  }

  const { election, ballotStyleId, dimensions, ...restProps } = props;
  if (election.type === 'primary') {
    return PrimaryBallotPageContent(props, scratchpad);
  }
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  // For now, just one section for candidate contests, one for ballot measures.
  // TODO support arbitrarily defined sections
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }

  function isPartisanContest(contest: CandidateContestStruct): boolean {
    return (
      ((contest.candidates[0]?.partyIds?.length || 0) > 0 &&
        contest.districtId !== 'judicial') ||
      contest.id === 'straight-party-ticket'
    );
  }

  const straightPartyContest = contests.find(
    (c) => c.type === 'straight-party'
  );
  const districtContests = contests.filter(
    (c): c is DistrictContest => c.type !== 'straight-party'
  );
  const contestSections = [
    {
      header: 'Partisan Section',
      contests: districtContests.filter(
        (contest) => contest.type === 'candidate' && isPartisanContest(contest)
      ),
      leadingContests: straightPartyContest ? [straightPartyContest] : [],
    },
    {
      header: 'Nonpartisan Section',
      contests: districtContests.filter(
        (contest) => contest.type === 'candidate' && !isPartisanContest(contest)
      ),
      leadingContests: [] as AnyContest[],
    },
    {
      header: 'Proposal Section',
      contests: districtContests.filter(
        (contest) => contest.type === 'yesno'
      ),
      leadingContests: [] as AnyContest[],
    },
  ]
    .filter(
      (section) =>
        section.contests.length > 0 || section.leadingContests.length > 0
    )
    .map((section) => ({
      header: section.header,
      leadingContests: section.leadingContests,
      subsections: groupBy(
        section.contests,
        (contest) => contest.districtId
      ).map(([districtId, sectionContests]) => ({
        header: election.districts.find((d) => d.id === districtId)?.name,
        contests: sectionContests,
      })),
    }));

  const horizontalGapPx = 0;
  const verticalGapPx = 0;

  const numColumns = 4;
  const columnWidthPx =
    (dimensions.width - horizontalGapPx * (numColumns - 1)) / numColumns;

  const sectionElements = contestSections.map((section) => ({
    header: <SectionHeader>{section.header}</SectionHeader>,
    leadingContests: section.leadingContests.map((contest) => ({
      contest,
      element: (
        <Contest
          key={contest.id}
          contest={contest}
          election={election}
          ballotStyle={ballotStyle}
        />
      ),
    })),
    subsections: section.subsections.map((subsection) => ({
      header:
        subsection.header !== undefined ? (
          <DivisionalHeader>{subsection.header}</DivisionalHeader>
        ) : undefined,
      contests: subsection.contests.map((contest) => ({
        contest,
        element: (
          <Contest
            key={contest.id}
            contest={contest}
            election={election}
            ballotStyle={ballotStyle}
          />
        ),
      })),
    })),
  }));

  const flattenedElements = sectionElements.flatMap((section) => {
    const leadingElements = section.leadingContests.map(
      ({ element }) => element
    );
    const subsectionElements = section.subsections.flatMap((subsection) => [
      ...(subsection.header ? [subsection.header] : []),
      ...subsection.contests.map(({ element }) => element),
    ]);
    return [section.header, ...leadingElements, ...subsectionElements];
  });

  const measurements = await scratchpad.measureElements(
    <BackendLanguageContextProvider
      currentLanguageCode={primaryLanguageCode(ballotStyle)}
      uiStringsPackage={election.ballotStrings}
    >
      {flattenedElements.map((element, i) => (
        <div
          className="wrapper"
          key={i}
          style={{ width: `${columnWidthPx}px` }}
        >
          {element}
        </div>
      ))}
    </BackendLanguageContextProvider>,
    '.wrapper'
  );
  const measurementsQueue = measurements.toReversed();

  const measuredSections = [];
  for (const sectionElement of sectionElements) {
    const sectionHeaderMeasurements = assertDefined(measurementsQueue.pop());
    const measuredLeadingContests = [];
    for (const leadingContest of sectionElement.leadingContests) {
      const contestMeasurements = assertDefined(measurementsQueue.pop());
      measuredLeadingContests.push({
        ...leadingContest,
        ...contestMeasurements,
      });
    }
    const measuredSubsections = [];
    for (const subsectionElement of sectionElement.subsections) {
      const subsectionHeaderMeasurements =
        subsectionElement.header && assertDefined(measurementsQueue.pop());
      const measuredContests = [];
      for (const contestElement of subsectionElement.contests) {
        const contestMeasurements = assertDefined(measurementsQueue.pop());
        measuredContests.push({
          ...contestElement,
          ...contestMeasurements,
        });
      }
      measuredSubsections.push({
        header: subsectionElement.header && {
          element: subsectionElement.header,
          ...assertDefined(subsectionHeaderMeasurements),
        },
        elements: measuredContests,
      });
    }
    // Insert leading contests as a subsection at the top (no header)
    if (measuredLeadingContests.length > 0) {
      measuredSubsections.unshift({
        header: undefined,
        elements: measuredLeadingContests,
      });
    }
    measuredSections.push({
      header: {
        element: sectionElement.header,
        ...sectionHeaderMeasurements,
      },
      subsections: measuredSubsections,
    });
  }

  const { columns, leftoverSections } = layOutSectionsInColumns({
    sections: measuredSections,
    numColumns,
    maxColumnHeight: dimensions.height,
    elementGap: verticalGapPx,
  });

  const sectionsElement = (
    <div style={{ display: 'flex', gap: `${horizontalGapPx}px` }}>
      {columns.map((column, i) => (
        <ContestColumn
          key={`column-${i}`}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: `${verticalGapPx}px`,
          }}
        >
          {column.map(({ element }) => element)}
        </ContestColumn>
      ))}
    </div>
  );

  const contestsLeftToLayout = leftoverSections.flatMap((section) =>
    section.subsections.flatMap((subsection) =>
      subsection.elements.map((c) => {
        assert('contest' in c);
        return c.contest;
      })
    )
  );

  if (contests.length > 0 && contestsLeftToLayout.length === contests.length) {
    return err({
      error: 'contestTooLong',
      contest: contestsLeftToLayout[0],
    });
  }

  const currentPageElement =
    contestsLeftToLayout.length === contests.length ? (
      <BlankPageMessage />
    ) : (
      sectionsElement
    );

  const nextPageProps =
    contestsLeftToLayout.length > 0
      ? {
          ...restProps,
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

export const miBallotTemplate: BallotPageTemplate<BaseBallotProps> = {
  stylesComponent: BaseStyles,
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
