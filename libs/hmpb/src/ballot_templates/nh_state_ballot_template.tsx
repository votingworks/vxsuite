import {
  assertDefined,
  err,
  find,
  groupBy,
  iter,
  ok,
  range,
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
  Box,
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
} from '../ballot_components';
import {
  BaseBallotProps,
  BallotPageTemplate,
  ContentComponentResult,
} from '../render_ballot';
import { Watermark } from './watermark';
import { BallotMode, PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { RenderScratchpad } from '../renderer';
import { Instructions } from './nh_primary_ballot_template';

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
    <Box
      style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1 }}>
        <Instructions />
      </div>
      <div style={{ flex: 1 }}>
        <DualLanguageText>
          <div
            style={{
              textAlign: 'center',
              display: 'flex',
              gap: '0.5rem',
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
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
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
        {/* <div style={{ textAlign: 'center' }}>
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
                marginBottom: '-0.5rem',
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
        </div> */}
      </div>
    </Box>
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
}): JSX.Element {
  const pageDimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
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
        {/* {watermark && <Watermark>{watermark}</Watermark>} */}
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
  grid-template-columns: 0.85fr repeat(3, 1fr) 0.8fr;
`;

const CandidateContestSectionHeaderContainer = styled.div`
  ${rowStyles}
  border: 1px solid ${Colors.BLACK};
  border-width: 2px 0 1px 0;
  > div {
    background-color: rgb(71, 71, 71);
    color: ${Colors.WHITE};
    &:not(:first-child) {
      border-left: 1px solid ${Colors.DARKER_GRAY};
    }
    padding: 0.5rem;
    font-weight: 500;
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
  border-bottom: 2px solid ${Colors.BLACK};
  border-right: 1px solid ${Colors.DARK_GRAY};
`;

const ContestHeader = styled.div`
  min-width: 0;
  background-color: ${Colors.LIGHT_GRAY};
  border-bottom: 2px solid ${Colors.BLACK};
  border-right: 1px solid ${Colors.DARK_GRAY};
  padding: 0.5rem;
`;

function CandidateList({
  contestId,
  candidates,
  party,
}: {
  contestId: ContestId;
  candidates: Candidate[];
  party?: Party;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {candidates.map((candidate, i) => {
        const optionInfo: OptionInfo = {
          type: 'option',
          contestId,
          optionId: candidate.id,
        };
        return (
          <div
            key={candidate.id}
            style={{
              flex: 1,
              padding: '0.375rem 0.375rem',
              borderTop: i !== 0 ? `1px solid ${Colors.DARK_GRAY}` : undefined,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
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
      <ContestHeader>
        <DualLanguageText delimiter="/">
          <h3>{electionStrings.contestTitle(contest)}</h3>
        </DualLanguageText>
        <DualLanguageText delimiter="/">
          <div style={{ fontSize: '0.9em' }}>{voteForText}</div>
        </DualLanguageText>
        {contest.termDescription && (
          <DualLanguageText delimiter="/">
            <div>{electionStrings.contestTerm(contest)}</div>
          </DualLanguageText>
        )}
      </ContestHeader>
      <CandidateListCell>
        <CandidateList
          contestId={contest.id}
          candidates={democraticCandidates}
        />
      </CandidateListCell>
      <CandidateListCell>
        <CandidateList
          contestId={contest.id}
          candidates={republicanCandidates}
        />
      </CandidateListCell>
      <CandidateListCell>
        {otherCandidateGroups.map(([partyId, candidates]) => (
          <div key={partyId}>
            <CandidateList
              contestId={contest.id}
              candidates={candidates}
              party={find(parties, (p) => p.id === partyId)}
            />
          </div>
        ))}
      </CandidateListCell>
      <CandidateListCell style={{ backgroundColor: Colors.LIGHT_GRAY }}>
        <div
          style={{
            fontSize: '0.7rem',
            padding: '0.125rem',
          }}
        >
          {electionStrings.contestTitle(contest)}
        </div>
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
                  gap: '0.5rem',
                  padding: '0.5rem 0.375rem',
                  justifyContent: 'end',
                  textAlign: 'right',
                  borderBottom:
                    writeInIndex !== contest.seats - 1
                      ? `1px solid ${Colors.DARK_GRAY}`
                      : undefined,
                  backgroundColor: Colors.WHITE,
                }}
              >
                <AlignedBubble optionInfo={optionInfo} />
              </div>
            );
          })}
      </CandidateListCell>
    </CandidateContestRow>
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
    if (section[0].type === 'candidate') {
      // Add a section header for candidate contests
      contestElements.unshift(<CandidateContestSectionHeader />);
    }
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
    const numElementsUsed = columns.flat().length;
    if (numElementsUsed < section.length) {
      contestSections.unshift(section.slice(numElementsUsed));
    }

    // If there wasn't enough room left for any contests, go to the next page
    if (
      height === 0 ||
      numElementsUsed === 1 // Only the header fit
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
};
