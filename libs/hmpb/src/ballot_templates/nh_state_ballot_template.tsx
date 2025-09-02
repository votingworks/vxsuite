import {
  assertDefined,
  err,
  find,
  groupBy,
  iter,
  ok,
  range,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  ballotPaperDimensions,
  BallotStyleId,
  BallotType,
  Candidate,
  CandidateContest as CandidateContestStruct,
  ContestId,
  Election,
  getBallotStyle,
  getContests,
  getPartyForBallotStyle,
  Party,
  YesNoContest,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import styled, { css } from 'styled-components';
import { Buffer } from 'node:buffer';
import React from 'react';
import {
  primaryLanguageCode,
  Page,
  pageMarginsInches,
  TimingMarkGrid,
  Footer,
  BlankPageMessage,
  DualLanguageText,
  Colors,
  OptionInfo,
  AlignedBubble,
  WRITE_IN_OPTION_CLASS,
  Box,
  ContestHeader,
  BubbleShape,
} from '../ballot_components';
import {
  BaseBallotProps,
  BallotPageTemplate,
  ContentComponentResult,
  BallotLayoutError,
} from '../render_ballot';
import { Watermark } from './watermark';
import { BallotMode, PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { RenderScratchpad } from '../renderer';
import { handCountInsigniaImageData, sosSignatureImageData } from './nh_images';
import { BaseStyles } from '../base_styles';

const BubbleDiagram = styled(BubbleShape)`
  display: inline-block;
  vertical-align: top;
  transform: scale(0.8);
`;

export function Instructions(): JSX.Element {
  return (
    <div
      style={{
        fontSize: '0.75rem',
        textAlign: 'justify',
        lineHeight: '1.1',
      }}
    >
      <h2>Instructions to Voters</h2>
      <div>
        <strong>1. To Vote:</strong> Completely fill in the oval{' '}
        <BubbleDiagram /> to the right of your choice like this{' '}
        <BubbleDiagram isFilled />. For each office vote for up to the number of
        candidates stated in the sentences: “Vote for not more than 1;” or “Vote
        for up to X;” “X will be elected.” If you vote for more than the stated
        number of candidates, your vote for that office will not be counted.
      </div>
      <div>
        <strong>2. To Vote by Write-in:</strong> To vote for a person whose name
        is not printed on the ballot, write the name of the person in the
        “write-in” space and completely fill in the oval <BubbleDiagram /> to
        the right of the “write-in” space like this <BubbleDiagram isFilled />.
      </div>
    </div>
  );
}

export function Header({
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
        fontFamily: 'Roboto Condensed',
        display: 'grid',
        gridTemplateColumns: '2.4fr 1fr 0.8fr',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <div>
        <Instructions />
      </div>
      <div>
        <DualLanguageText>
          <div
            style={{
              textAlign: 'center',
              display: 'flex',
              gap: '0.125rem',
              flexDirection: 'column',
            }}
          >
            <h4>{ballotTitle}</h4>
            <h1>{electionStrings.countyName(election.county)}</h1>
            {party && <h1>{electionStrings.partyFullName(party)}</h1>}
            <h4>{electionStrings.electionTitle(election)}</h4>
            <h4>{electionStrings.electionDate(election)}</h4>
          </div>
        </DualLanguageText>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            height: '4.5rem',
            aspectRatio: '1 / 1',
            backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(
              election.seal
            ).toString('base64')})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              height: '2rem',
              width: '7rem',
              backgroundImage: `url(${sosSignatureImageData})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              marginBottom: '-0.125rem',
              visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
            }}
          />
          <div
            style={{
              visibility: ballotMode === 'sample' ? 'hidden' : 'visible',
              fontSize: '0.8rem',
            }}
          >
            Secretary of State
          </div>
        </div>
      </div>
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
  watermark,
}: NhStateBallotProps & {
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
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  ballotStyleId={ballotStyleId}
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
            />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

const rowStyles = css`
  font-family: 'Roboto Condensed';
  display: grid;
  grid-template-columns: 0.8fr repeat(3, 1fr) 0.85fr;
`;

const CandidateContestSectionHeaderContainer = styled.div`
  ${rowStyles}
  border: 1px solid ${Colors.BLACK};
  border-width: 0 0 0px 0;
  > div {
    background-color: rgb(71, 71, 71);
    color: ${Colors.WHITE};
    &:not(:first-child) {
      border-left: 1px solid ${Colors.DARKER_GRAY};
    }
    padding: 0.5rem;
    font-weight: 500;
    font-size: 1.1rem;
  }
`;

function CandidateContestSectionHeader(): JSX.Element {
  return (
    <CandidateContestSectionHeaderContainer>
      <div>Offices</div>
      <div>Democratic Candidates</div>
      <div>Republican Candidates</div>
      <div>
        Other
        <br />
        Candidates
      </div>
      <div>Write-in Candidates</div>
    </CandidateContestSectionHeaderContainer>
  );
}

const CandidateContestRow = styled.div`
  ${rowStyles}
`;

const CandidateListCell = styled.div`
  border-bottom: 2px solid ${Colors.DARKER_GRAY};
  border-right: 1px solid ${Colors.DARK_GRAY};
`;

const ContestTitleCell = styled.div`
  min-width: 0;
  background-color: ${Colors.LIGHT_GRAY};
  border-bottom: 2px solid ${Colors.DARKER_GRAY};
  border-right: 1px solid ${Colors.DARK_GRAY};
  padding: 0.375rem 0.25rem;
`;

function CandidateList({
  contestId,
  candidates,
  party,
  offset,
}: {
  contestId: ContestId;
  candidates: Candidate[];
  party?: Party;
  offset?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingTop: offset && candidates.length > 1 ? '1.375rem' : undefined,
        justifyContent: candidates.length === 1 ? 'center' : 'start',
        gap: '0.5rem',
      }}
    >
      {candidates.map((candidate) => {
        const optionInfo: OptionInfo = {
          type: 'option',
          contestId,
          optionId: candidate.id,
        };
        return (
          <div
            key={candidate.id}
            style={{
              padding: '0.375rem 0.375rem',
              height: '2rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '0.375rem',
                justifyContent: 'end',
                textAlign: 'right',
              }}
            >
              <div>
                <strong>{candidate.name}</strong>
                {party && (
                  <div style={{ fontSize: '0.8em' }}>
                    {electionStrings.partyName(party)}
                  </div>
                )}
              </div>
              <AlignedBubble optionInfo={optionInfo} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CandidateContest({
  election,
  contest,
}: {
  election: Election;
  contest: CandidateContestStruct;
}) {
  const voteForText = {
    1: hmpbStrings.hmpbVoteFor1,
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

  const candidatesByParty = groupBy(
    [...contest.candidates],
    (candidate) => candidate.partyIds?.[0]
  );
  const { parties } = election;
  const democracticPartyId = find(parties, (p) => p.abbrev === 'Democratic').id;
  const republicanPartyId = find(parties, (p) => p.abbrev === 'Republican').id;
  const democraticCandidates =
    candidatesByParty.find(
      ([partyId]) => partyId === democracticPartyId
    )?.[1] ?? [];
  const republicanCandidates =
    candidatesByParty.find(([partyId]) => partyId === republicanPartyId)?.[1] ??
    [];
  const otherCandidateGroups = candidatesByParty.filter(
    ([partyId]) =>
      !(partyId === democracticPartyId || partyId === republicanPartyId)
  );

  return (
    <CandidateContestRow>
      <ContestTitleCell>
        <div style={{ fontSize: '0.7rem' }}>For</div>
        <h4>{electionStrings.contestTitle(contest)}</h4>
        <div style={{ fontSize: '0.9rem' }}>{voteForText}</div>
        {willBeElectedText && (
          <div style={{ fontSize: '0.9rem' }}>{willBeElectedText}</div>
        )}
        {contest.termDescription && (
          <div>{electionStrings.contestTerm(contest)}</div>
        )}
      </ContestTitleCell>
      <CandidateListCell>
        <CandidateList
          contestId={contest.id}
          candidates={democraticCandidates}
          offset
        />
      </CandidateListCell>
      <CandidateListCell>
        <CandidateList
          contestId={contest.id}
          candidates={republicanCandidates}
        />
      </CandidateListCell>
      <CandidateListCell>
        {otherCandidateGroups.map(([partyId, candidates], i) => (
          <div key={partyId} style={{ height: '100%' }}>
            <CandidateList
              contestId={contest.id}
              candidates={candidates}
              party={find(parties, (p) => p.id === partyId)}
              offset={i === 0}
            />
          </div>
        ))}
      </CandidateListCell>
      <CandidateListCell>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: contest.seats === 1 ? 'center' : 'start',
            height: '100%',
            gap: '0.5rem',
          }}
        >
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
                <div
                  key={writeInIndex}
                  className={WRITE_IN_OPTION_CLASS}
                  style={{
                    display: 'flex',
                    padding: '0.375rem 0.375rem',
                    height: '2rem',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      fontSize: '0.6rem',
                      padding: '0.125rem',
                      marginTop: '1rem',
                      textAlign: 'right',
                    }}
                  >
                    {electionStrings.contestTitle(contest)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'end',
                    }}
                  >
                    <AlignedBubble optionInfo={optionInfo} />
                  </div>
                </div>
              );
            })}
        </div>
      </CandidateListCell>
    </CandidateContestRow>
  );
}

function BallotMeasureContestSectionHeader() {
  return (
    <div
      style={{
        borderTop: `2px solid ${Colors.DARKER_GRAY}`,
        borderBottom: `2px solid ${Colors.DARKER_GRAY}`,
      }}
    >
      <ContestHeader
        style={{
          fontFamily: 'Roboto Condensed',
          backgroundColor: Colors.DARKER_GRAY,
          color: Colors.WHITE,
        }}
      >
        <h3>Constitutional Amendment Questions</h3>
        <div>Constitutional Amendments Proposed by the General Court </div>
      </ContestHeader>
    </div>
  );
}

function BallotMeasureContest({ contest }: { contest: YesNoContest }) {
  return (
    <Box
      style={{
        padding: 0,
        fontFamily: 'Roboto Condensed',
        borderTopWidth: '0',
      }}
    >
      {/* <ContestHeader>
        <h4>{electionStrings.contestTitle(contest)}</h4>
      </ContestHeader> */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
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
          <RichText
            tableBorderWidth={'1px'}
            tableBorderColor={Colors.DARKER_GRAY}
            tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
          >
            1. {contest.description}
          </RichText>
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
                borderLeft: `1px solid ${Colors.LIGHT_GRAY}`,
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
  props: (NhStateBallotProps & { dimensions: PixelDimensions }) | undefined,
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
  const sectionGapPx = 20;
  let heightUsed = 0;

  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSections.shift());
    const contestElements = section.map((contest) => (
      <Contest key={contest.id} contest={contest} election={election} />
    ));
    const sectionHeader =
      section[0].type === 'candidate' ? (
        <CandidateContestSectionHeader />
      ) : (
        <BallotMeasureContestSectionHeader />
      );
    contestElements.unshift(sectionHeader);
    const contestMeasurements = await scratchpad.measureElements(
      <BackendLanguageContextProvider
        currentLanguageCode={primaryLanguageCode(ballotStyle)}
        uiStringsPackage={election.ballotStrings}
      >
        {contestElements.map((contest, i) => (
          <div
            className="contestWrapper"
            key={i}
            style={{ width: `${dimensions.width}px` }}
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
      numColumns: 1,
      maxColumnHeight: dimensions.height - heightUsed,
    });

    // Put contests we didn't lay out back on the front of the queue
    const numElementsUsed = Math.max(
      0,
      columns.flat().length - 1 // -1 for the header
    );
    if (numElementsUsed < section.length) {
      contestSections.unshift(section.slice(numElementsUsed));
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (
      height === 0 ||
      numElementsUsed === 0 // Only the header fit
    ) {
      break;
    }

    heightUsed += height + sectionGapPx;
    pageSections.push(
      <div key={`section-${pageSections.length + 1}`}>
        {columns.map((column, i) => (
          <div
            key={`column-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
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
    return err({
      error: 'contestTooLong',
      contest: contestsLeftToLayout[0],
    });
  }

  // Add hand-count insignia
  if (contestsLeftToLayout.length === 0) {
    pageSections.push(
      <div
        key="hand-count-insignia"
        style={{
          display: 'flex',
          justifyContent: 'end',
        }}
      >
        <div
          style={{
            backgroundImage: `url(${handCountInsigniaImageData})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            height: '20rem',
            width: '15rem',
          }}
        />
      </div>
    );
  }

  const currentPageElement =
    pageSections.length > 0 ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${sectionGapPx}px`,
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

export type NhStateBallotProps = BaseBallotProps;

export const nhStateBallotTemplate: BallotPageTemplate<NhStateBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
  stylesComponent: BaseStyles,
};
