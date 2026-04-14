import React from 'react';
import {
  assert,
  assertDefined,
  err,
  find,
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
  Election,
  PrecinctId,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  isOpenPrimary,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
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
  primaryLanguageCode,
  Footer,
  Colors,
  BlankPageMessage,
  AlignedBubble,
  ContestTitle,
  CANDIDATE_OPTION_CLASS,
  BALLOT_MEASURE_OPTION_CLASS,
  PrecinctOrSplitName,
} from '../ballot_components';
import { PixelDimensions, PixelMeasurements } from '../types';
import { Section, layOutSectionsInColumns } from '../layout_in_columns';
import { hmpbStrings } from '../hmpb_strings';
import { Watermark } from './watermark';
import { BaseStyles as BaseStylesComponent } from '../base_styles';

// MI has specific ballot styling requirements (e.g. font sizes and tints for
// various elements), so we encode those all as styled components here.

const Box = styled.div`
  border: 1px solid ${Colors.BLACK};
  /* Collapse vertical borders between stacked boxes */
  &:not(:first-child) {
    border-top: none;
  }
`;

const ContestColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  /* Collapse horizontal borders between adjacent columns */
  &:not(:first-child) {
    > ${Box} {
      margin-left: -1px;
    }
  }
`;

// Use compact styles to set the base font-size to 10pt
function BaseStyles(): JSX.Element {
  return <BaseStylesComponent compact />;
}

const SectionHeader = styled(Box)`
  background: ${Colors.INVERSE_GRAY};
  color: ${Colors.WHITE};
  text-align: center;
  font-weight: bold;
  font-size: 11pt;
  padding: 0.25rem 0.5rem;
`;

const SubsectionHeader = styled(Box)`
  background: ${Colors.DARKER_GRAY};
  text-align: center;
  font-weight: bold;
  font-size: 11pt;
  padding: 0.25rem 0.5rem;
`;

const ContestHeader = styled.div`
  background: ${Colors.LIGHT_GRAY};
  text-align: center;
  font-weight: bold;
  font-size: 10pt;
  padding: 0.25rem 0.5rem;
`;

const VoteFor = styled.div`
  text-align: center;
  font-weight: normal;
  font-size: 8pt;
`;

const CandidateName = styled.div`
  font-weight: bold;
  font-size: 9pt;
`;

const ProposalDescription = styled.div`
  font-size: 9pt;
`;

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
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const party = find(
    election.parties,
    (p) => p.id === assertDefined(ballotStyle.partyId)
  );

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
      <div style={{ fontSize: '1.2em', textTransform: 'uppercase' }}>
        {ballotTitle}
      </div>
      <div>{electionStrings.partyFullName(party)}</div>
      <div>{electionStrings.electionTitle(election)}</div>
      <div>{electionStrings.electionDate(election)}</div>
      <div>
        {electionStrings.countyName(election.county)},{' '}
        {electionStrings.stateName(election)}
      </div>
      <PrecinctOrSplitName
        election={election}
        precinctId={precinctId}
        ballotStyleId={ballotStyleId}
      />
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
        <TimingMarkGrid pageDimensions={pageDimensions} ballotMode={ballotMode}>
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
              <Header
                election={election}
                ballotStyleId={ballotStyleId}
                precinctId={precinctId}
                ballotMode={ballotMode}
              />
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
  contest,
  ballotStyle,
}: {
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
      }}
    >
      <ContestHeader>
        <div>{electionStrings.contestTitle(contest)}</div>
        <VoteFor>{voteForText}</VoteFor>
      </ContestHeader>
      <ul>
        {candidates.map((candidate, i) => {
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
                right: 14.6,
              },
            };
            return (
              <li
                key={writeInIndex}
                className={WRITE_IN_OPTION_CLASS}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                }}
              >
                <AlignedBubble optionInfo={optionInfo} />
              </li>
            );
          })}
      </ul>
    </Box>
  );
}

function BallotMeasureContest({ contest }: { contest: YesNoContest }) {
  return (
    <Box>
      <ContestHeader>
        <ContestTitle>{electionStrings.contestTitle(contest)}</ContestTitle>
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
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <ProposalDescription>
            <RichText
              tableBorderWidth={'1px'}
              tableBorderColor={Colors.DARKER_GRAY}
              tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
            >
              {electionStrings.contestDescription(contest)}
            </RichText>
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
                <strong>{electionStrings.contestOptionLabel(option)}</strong>
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
  ballotStyle,
}: {
  contest: AnyContest;
  ballotStyle: BallotStyle;
}) {
  switch (contest.type) {
    case 'candidate':
      return <CandidateContest contest={contest} ballotStyle={ballotStyle} />;
    case 'yesno':
      return <BallotMeasureContest contest={contest} />;
    default:
      return throwIllegalValue(contest);
  }
}

interface ContestSection {
  header: string;
  subsections: Array<{
    header: string;
    contests: AnyContest[];
  }>;
}

const NUM_COLUMNS = 2;

function buildContestSections(
  contests: readonly AnyContest[],
  election: Election
): ContestSection[] {
  function groupByDistrict(
    sectionContests: AnyContest[]
  ): ContestSection['subsections'] {
    return groupBy(sectionContests, (contest) => contest.districtId).map(
      ([districtId, districtContests]) => ({
        header: find(election.districts, (d) => d.id === districtId).name,
        contests: districtContests,
      })
    );
  }

  const partisanContests = contests.filter(
    (contest) => contest.type === 'candidate' && contest.partyId
  );
  const nonpartisanContests = contests.filter(
    (contest) => contest.type === 'candidate' && !contest.partyId
  );
  const proposalContests = contests.filter(
    (contest) => contest.type === 'yesno'
  );

  return [
    {
      header: 'Partisan Section',
      subsections: groupByDistrict(partisanContests),
    },
    {
      header: 'Nonpartisan Section',
      subsections: groupByDistrict(nonpartisanContests),
    },
    {
      header: 'Proposal Section',
      subsections: groupByDistrict(proposalContests),
    },
  ].filter((section) => section.subsections.length > 0);
}

interface MeasuredElement {
  element: JSX.Element;
  height: number;
}

interface MeasuredContestElement extends MeasuredElement {
  contest: AnyContest;
}

type MeasuredSection = Section<MeasuredElement> & {
  subsections: Array<{
    header: MeasuredElement;
    elements: MeasuredContestElement[];
  }>;
};

async function measureSectionElements(
  contestSections: ContestSection[],
  election: Election,
  ballotStyle: BallotStyle,
  columnWidthPx: number,
  scratchpad: RenderScratchpad
): Promise<MeasuredSection[]> {
  const sectionElements = contestSections.map((section) => ({
    header: <SectionHeader>{section.header}</SectionHeader>,
    subsections: section.subsections.map((subsection) => ({
      header: <SubsectionHeader>{subsection.header}</SubsectionHeader>,
      contests: subsection.contests.map((contest) => ({
        contest,
        element: (
          <Contest
            key={contest.id}
            contest={contest}
            ballotStyle={ballotStyle}
          />
        ),
      })),
    })),
  }));

  // We want to do a single measurement pass for all elements in the section, so
  // we flatten them into an ordered list, measure them, then reconstruct the
  // section hierarchy with the measurements attached.

  const flattenedElements = sectionElements.flatMap((section) =>
    [section.header].concat(
      section.subsections.flatMap((subsection) => [
        subsection.header,
        ...subsection.contests.map(({ element }) => element),
      ])
    )
  );

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
  function popMeasurement(): PixelMeasurements {
    return assertDefined(measurementsQueue.pop());
  }

  const measuredSections: MeasuredSection[] = sectionElements.map(
    (sectionElement) => ({
      header: { element: sectionElement.header, ...popMeasurement() },
      subsections: sectionElement.subsections.map((subsectionElement) => ({
        header: {
          element: subsectionElement.header,
          ...popMeasurement(),
        },
        elements: subsectionElement.contests.map(
          (contestElement): MeasuredContestElement => ({
            ...contestElement,
            ...popMeasurement(),
          })
        ),
      })),
    })
  );

  return measuredSections;
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
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const contests = getContests({ election, ballotStyle });
  assert(
    election.type === 'primary' && !isOpenPrimary(election),
    'Only closed primary elections are currently supported in this template'
  );
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }

  const contestSections = buildContestSections(contests, election);
  const columnWidthPx = dimensions.width / NUM_COLUMNS;
  const measuredSections = await measureSectionElements(
    contestSections,
    election,
    ballotStyle,
    columnWidthPx,
    scratchpad
  );

  const { columns, leftoverSections } = layOutSectionsInColumns({
    sections: measuredSections,
    numColumns: NUM_COLUMNS,
    maxColumnHeight: dimensions.height,
  });

  const sectionsElement = (
    <div style={{ display: 'flex' }}>
      {columns.map((column, i) => (
        <ContestColumn key={i}>
          {column.map(({ element }) => element)}
        </ContestColumn>
      ))}
    </div>
  );

  const contestsLeftToLayout = leftoverSections.flatMap((section) =>
    section.subsections.flatMap((subsection) =>
      (subsection.elements as MeasuredContestElement[]).map((c) => c.contest)
    )
  );

  if (contestsLeftToLayout.length === contests.length) {
    return err({
      error: 'contestTooLong',
      contest: contestsLeftToLayout[0],
    });
  }

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
    currentPageElement: sectionsElement,
    nextPageProps,
  });
}

export const miBallotTemplate: BallotPageTemplate<BaseBallotProps> = {
  stylesComponent: BaseStyles,
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
