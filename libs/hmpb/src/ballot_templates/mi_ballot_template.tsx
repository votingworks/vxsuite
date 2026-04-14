import React from 'react';
import {
  assert,
  assertDefined,
  deepEqual,
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
import {
  Section,
  layOutSectionsInColumns,
  layOutSectionsInParallelColumns,
} from '../layout_in_columns';
import { hmpbStrings } from '../hmpb_strings';
import { Watermark } from './watermark';
import { BaseStyles as BaseStylesComponent } from '../base_styles';
import { ArrowDown } from '../svg_assets';

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

const PartySectionHeader = styled(Box)`
  text-align: center;
  font-weight: bold;
  font-size: 11pt;
  padding: 0.25rem 0.5rem;
  border-top: none;
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
  const party = ballotStyle.partyId
    ? find(election.parties, (p) => p.id === ballotStyle.partyId)
    : undefined;

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
      {party && <div>{electionStrings.partyFullName(party)}</div>}
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

interface ContestElement {
  contest: AnyContest;
  element: JSX.Element;
}

type ContestSection = Section<JSX.Element, ContestElement>;

function buildSubsectionsByDistrict(
  election: Election,
  ballotStyle: BallotStyle,
  sectionContests: AnyContest[]
): ContestSection['subsections'] {
  return groupBy(sectionContests, (contest) => contest.districtId).map(
    ([districtId, districtContests]) => ({
      header: (
        <SubsectionHeader>
          {find(election.districts, (d) => d.id === districtId).name}
        </SubsectionHeader>
      ),
      elements: districtContests.map((contest) => ({
        contest,
        element: <Contest contest={contest} ballotStyle={ballotStyle} />,
      })),
    })
  );
}

function buildSections(
  election: Election,
  ballotStyle: BallotStyle,
  sectionTemplates: Array<{ header: JSX.Element; contests: AnyContest[] }>
): ContestSection[] {
  return sectionTemplates
    .filter((section) => section.contests.length > 0)
    .map((section) => ({
      header: section.header,
      subsections: buildSubsectionsByDistrict(
        election,
        ballotStyle,
        section.contests
      ),
    }));
}

function buildClosedPrimaryContestSections(
  contests: readonly AnyContest[],
  election: Election,
  ballotStyle: BallotStyle
): ContestSection[] {
  return buildSections(election, ballotStyle, [
    {
      header: <SectionHeader>Partisan Section</SectionHeader>,
      contests: contests.filter(
        (contest) => contest.type === 'candidate' && contest.partyId
      ),
    },
    {
      header: <SectionHeader>Nonpartisan Section</SectionHeader>,
      contests: contests.filter(
        (contest) => contest.type === 'candidate' && !contest.partyId
      ),
    },
    {
      header: <SectionHeader>Proposal Section</SectionHeader>,
      contests: contests.filter((contest) => contest.type === 'yesno'),
    },
  ]);
}

function buildOpenPrimaryContestSections(
  contests: readonly AnyContest[],
  election: Election,
  ballotStyle: BallotStyle
): {
  partisanSections: ContestSection[];
  nonPartisanSections: ContestSection[];
} {
  const partisanSections = election.parties.map((party) => ({
    header: (
      <PartySectionHeader>
        {party.name} Party
        <br />
        Section
      </PartySectionHeader>
    ),
    contests: contests.filter(
      (contest) => contest.type === 'candidate' && contest.partyId === party.id
    ),
  }));

  const nonEmptyPartisanSections = partisanSections.filter(
    (section) => section.contests.length > 0
  );
  for (const section of nonEmptyPartisanSections) {
    if (
      !deepEqual(
        section.contests.map(({ districtId, title }) => ({
          districtId,
          title,
        })),
        nonEmptyPartisanSections[0].contests.map(({ districtId, title }) => ({
          districtId,
          title,
        }))
      )
    ) {
      throw new Error(
        'Mismatched partisan contests. All parties must have contests with the same district and title, and they must be in the same order.'
      );
    }
  }

  return {
    partisanSections: buildSections(election, ballotStyle, partisanSections),
    nonPartisanSections: buildSections(election, ballotStyle, [
      {
        header: <SectionHeader>Nonpartisan Section</SectionHeader>,
        contests: contests.filter(
          (contest) => contest.type === 'candidate' && !contest.partyId
        ),
      },
      {
        header: <SectionHeader>Proposal Section</SectionHeader>,
        contests: contests.filter((contest) => contest.type === 'yesno'),
      },
    ]),
  };
}

type Measured<T> = T & PixelMeasurements;

type MeasuredSection = Section<
  Measured<{ element: JSX.Element }>,
  Measured<ContestElement>
>;

async function measureSectionElements(
  sectionElements: ContestSection[],
  election: Election,
  ballotStyle: BallotStyle,
  columnWidthPx: number,
  scratchpad: RenderScratchpad
): Promise<MeasuredSection[]> {
  // We want to do a single measurement pass for all elements in the section, so
  // we flatten them into an ordered list, measure them, then reconstruct the
  // section hierarchy with the measurements attached.

  const flattenedElements = sectionElements.flatMap((section) =>
    [section.header].concat(
      section.subsections.flatMap((subsection) => [
        subsection.header,
        ...subsection.elements.map(({ element }) => element),
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

  return sectionElements.map((sectionElement) => ({
    header: { element: sectionElement.header, ...popMeasurement() },
    subsections: sectionElement.subsections.map((subsectionElement) => ({
      header: {
        element: subsectionElement.header,
        ...popMeasurement(),
      },
      elements: subsectionElement.elements.map(
        (contestElement): Measured<ContestElement> => ({
          ...contestElement,
          ...popMeasurement(),
        })
      ),
    })),
  }));
}

interface ContestColumnsResult {
  sectionsElement: JSX.Element;
  leftoverContests: AnyContest[];
}

async function ClosedPrimaryContestColumns({
  contests,
  election,
  ballotStyle,
  dimensions,
  scratchpad,
}: {
  contests: readonly AnyContest[];
  election: Election;
  ballotStyle: BallotStyle;
  dimensions: PixelDimensions;
  scratchpad: RenderScratchpad;
}): Promise<ContestColumnsResult> {
  const sections = buildClosedPrimaryContestSections(
    contests,
    election,
    ballotStyle
  );

  const numColumns = 2;
  const columnWidthPx = dimensions.width / numColumns;
  const measuredSections = await measureSectionElements(
    sections,
    election,
    ballotStyle,
    columnWidthPx,
    scratchpad
  );

  const { columns, leftoverSections } = layOutSectionsInColumns({
    sections: measuredSections,
    numColumns,
    maxColumnHeight: dimensions.height,
  });

  return {
    sectionsElement: (
      <div style={{ display: 'flex' }}>
        {columns.map((column, i) => (
          <ContestColumn key={i}>
            {column.map(({ element }) => element)}
          </ContestColumn>
        ))}
      </div>
    ),
    leftoverContests: leftoverSections.flatMap((section) =>
      section.subsections.flatMap((subsection) =>
        subsection.elements.map((element) => element.contest)
      )
    ),
  };
}

async function OpenPrimaryContestColumns({
  contests,
  election,
  ballotStyle,
  dimensions,
  scratchpad,
}: {
  contests: readonly AnyContest[];
  election: Election;
  ballotStyle: BallotStyle;
  dimensions: PixelDimensions;
  scratchpad: RenderScratchpad;
}): Promise<ContestColumnsResult> {
  const { partisanSections, nonPartisanSections } =
    buildOpenPrimaryContestSections(contests, election, ballotStyle);

  const numColumns = 4;
  const numPartisanColumns = partisanSections.length;
  const maxNumPartisanColumns = numColumns - 1;
  if (numPartisanColumns > maxNumPartisanColumns) {
    throw new Error(
      `Too many parties to fit on ballot: ${numPartisanColumns} (max ${maxNumPartisanColumns})`
    );
  }
  const numNonPartisanColumns = numColumns - numPartisanColumns;
  const columnWidthPx = dimensions.width / numColumns;

  const measuredPartisanSections = await measureSectionElements(
    partisanSections,
    election,
    ballotStyle,
    columnWidthPx,
    scratchpad
  );
  const measuredNonPartisanSections = await measureSectionElements(
    nonPartisanSections,
    election,
    ballotStyle,
    columnWidthPx,
    scratchpad
  );

  const partisanSectionHeader = (
    <SectionHeader>
      Partisan Section - Vote Only 1 Party Selection
      <div style={{ display: 'flex' }}>
        {partisanSections.map((_, i) => (
          <div key={i} style={{ flex: 1 }}>
            <ArrowDown style={{ height: '3rem' }} />
          </div>
        ))}
      </div>
    </SectionHeader>
  );

  const [partisanSectionHeaderMeasurements] =
    numPartisanColumns > 0
      ? await scratchpad.measureElements(
          <BackendLanguageContextProvider
            currentLanguageCode={primaryLanguageCode(ballotStyle)}
            uiStringsPackage={election.ballotStrings}
          >
            <div
              style={{
                width: `${columnWidthPx * numPartisanColumns}px`,
              }}
              className="wrapper"
            >
              {partisanSectionHeader}
            </div>
          </BackendLanguageContextProvider>,
          '.wrapper'
        )
      : [{ height: 0 }];

  const {
    columns: partisanColumns,
    leftoverSections: leftoverPartisanSections,
  } = layOutSectionsInParallelColumns({
    sections: measuredPartisanSections,
    maxColumnHeight:
      dimensions.height - partisanSectionHeaderMeasurements.height,
  });

  const {
    columns: nonPartisanColumns,
    leftoverSections: leftoverNonpartisanSections,
  } = layOutSectionsInColumns({
    sections: measuredNonPartisanSections,
    numColumns: numNonPartisanColumns,
    maxColumnHeight: dimensions.height,
  });

  const partisanWidthPercent = (numPartisanColumns / numColumns) * 100;
  const nonPartisanWidthPercent = 100 - partisanWidthPercent;
  const sectionsElement = (
    <div style={{ display: 'flex' }}>
      {partisanColumns.length > 0 && (
        <div style={{ width: `${partisanWidthPercent}%` }}>
          {partisanSectionHeader}
          <div style={{ display: 'flex' }}>
            {partisanColumns.map((column, i) => (
              <ContestColumn key={`partisan-${i}`}>
                {column.map(({ element }) => element)}
              </ContestColumn>
            ))}
          </div>
        </div>
      )}
      {nonPartisanColumns.length > 0 && (
        <div
          style={{
            width: `${nonPartisanWidthPercent}%`,
            marginLeft: '-1px', // Collapse border
          }}
        >
          {nonPartisanColumns.map((column, i) => (
            <ContestColumn key={`nonpartisan-${i}`}>
              {column.map(({ element }) => element)}
            </ContestColumn>
          ))}
        </div>
      )}
    </div>
  );

  return {
    sectionsElement,
    leftoverContests: [
      ...leftoverPartisanSections,
      ...leftoverNonpartisanSections,
    ].flatMap((section) =>
      section.subsections.flatMap((subsection) =>
        subsection.elements.map((element) => element.contest)
      )
    ),
  };
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
  assert(election.type === 'primary', 'MI template only supports primaries');
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }

  const { leftoverContests, sectionsElement } = isOpenPrimary(election)
    ? await OpenPrimaryContestColumns({
        contests,
        election,
        ballotStyle,
        dimensions,
        scratchpad,
      })
    : await ClosedPrimaryContestColumns({
        contests,
        election,
        ballotStyle,
        dimensions,
        scratchpad,
      });

  if (leftoverContests.length === contests.length) {
    return err({
      error: 'contestTooLong',
      contest: leftoverContests[0],
    });
  }

  const nextPageProps =
    leftoverContests.length > 0
      ? {
          ...restProps,
          ballotStyleId,
          election: {
            ...election,
            contests: leftoverContests,
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
