import { Buffer } from 'node:buffer';
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
  BallotMode,
  ballotPaperDimensions,
  BallotType,
  BaseBallotProps,
  Candidate,
  CandidateContest as CandidateContestStruct,
  ContestId,
  Election,
  getBallotStyle,
  getContests,
  Party,
  YesNoContest,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import styled, { css } from 'styled-components';
import {
  primaryLanguageCode,
  Page,
  pageMarginsInches,
  TimingMarkGrid,
  BlankPageMessage,
  Colors,
  OptionInfo,
  AlignedBubble,
  WRITE_IN_OPTION_CLASS,
  QrCodeSlot,
} from '../ballot_components';
import {
  BallotPageTemplate,
  ContentComponentResult,
  BallotLayoutError,
} from '../render_ballot';
import { Watermark } from './watermark';
import { PixelDimensions } from '../types';
import { hmpbStrings } from '../hmpb_strings';
import { layOutInColumns } from '../layout_in_columns';
import { RenderScratchpad } from '../renderer';
import {
  allCaps,
  HandCountInsignia,
  Instructions,
  NhBaseStyles,
} from './nh_state_ballot_components';

export function Header({
  election,
  ballotType,
  ballotMode,
}: {
  election: Election;
  ballotType: BallotType;
  ballotMode: BallotMode;
}): JSX.Element {
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
        gridTemplateColumns: '1.8fr 1fr 0.6fr',
        alignItems: 'center',
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '10pt',
            textAlign: 'center',
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
          justifyContent: 'space-evenly',
          alignSelf: 'stretch',
          padding: '0 2.5rem',
        }}
      >
        {absenteeLabel && <h5>{absenteeLabel}</h5>}
        <h5>{ballotTitle} FOR</h5>
        <h1 style={{ fontSize: '18pt' }}>
          {electionStrings.countyName(election.county)}
        </h1>
        <h3>{electionStrings.electionTitle(election)}</h3>
        <h3>{electionStrings.electionDate(election)}</h3>
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
            height: '0.8in',
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
              width: '1.2in',
            }}
          />
          <div
            style={{
              ...allCaps,
              fontSize: '5pt',
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

const arrowNextPage = (
  <svg
    width="127"
    height="31"
    viewBox="0 0 127 31"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M100.5 9H0V21.5H100.5V30.5996L127 15.2998L100.5 0V9Z"
      fill="black"
    />
  </svg>
);

function Footer({
  pageNumber,
  isHandCount,
}: {
  pageNumber: number;
  isHandCount: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      {!isHandCount && (
        <div style={{ justifySelf: 'start' }}>
          <QrCodeSlot />
        </div>
      )}
      {pageNumber === 1 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'space-evenly',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '20pt', fontWeight: 'bold' }}>
            BALLOT CONTINUES ON BACK - TURN OVER
          </div>
          {arrowNextPage}
        </div>
      )}
    </div>
  );
}

function BallotPageFrame({
  election,
  ballotStyleId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  watermark,
}: NhGeneralBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): Result<JSX.Element, BallotLayoutError> {
  if (!election.signature) {
    // eslint-disable-next-line no-param-reassign
    election = {
      ...election,
      signature: {
        image:
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="96" viewBox="0 0 256 96"><image href="data:image/png;base64,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" width="256" height="96"></image> </svg>',
        caption: 'Secretary of State',
      },
    };

    // return err({ error: 'missingSignature' });
  }

  const isHandCount = false;

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
              {isHandCount && pageNumber === totalPages && (
                <HandCountInsignia election={election} />
              )}
            </div>
            <Footer pageNumber={pageNumber} isHandCount={isHandCount} />
          </div>
        </TimingMarkGrid>
      </Page>
    </BackendLanguageContextProvider>
  );
}

const rowStyles = css`
  display: grid;
  grid-template-columns: 0.8fr repeat(3, 1fr) 0.85fr;
`;

const CandidateContestSectionHeaderContainer = styled.div`
  ${rowStyles}
  > div {
    background-color: ${Colors.BLACK};
    color: ${Colors.WHITE};
    &:not(:last-child) {
      border-right: 1px solid ${Colors.WHITE};
    }
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.125rem;
    font-weight: bold;
    line-height: 0.9;
    font-size: 14pt;
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
  border-bottom: 2.5px solid ${Colors.BLACK};
  &:last-child {
    border-bottom-width: 1px;
  }
  > div:not(:last-child) {
    border-right: 1px solid ${Colors.BLACK};
  }
`;

const CandidateListCell = styled.div``;

const ContestTitleCell = styled.div`
  line-height: 1;
  text-align: center;
  min-width: 0;
  padding: 0.375rem 0.25rem;
  display: flex;
  align-items: center;
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
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: '3rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '0.375rem',
                justifyContent: 'end',
                textAlign: 'right',
                alignItems: 'center',
              }}
            >
              <div style={{ position: 'relative', width: '100%' }}>
                {party && (
                  <div
                    style={{
                      fontSize: '7.5pt',
                      position: 'absolute',
                      width: '100%',
                      textAlign: 'center',
                      top: '-0.75em',
                    }}
                  >
                    {electionStrings.partyName(party)}
                  </div>
                )}
                <h3>{candidate.name}</h3>
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

  const candidatesByParty = groupBy(
    [...contest.candidates],
    (candidate) => candidate.partyIds?.[0]
  );
  const { parties } = election;
  const democracticPartyId = find(parties, (p) => /^dem/i.test(p.abbrev)).id;
  const republicanPartyId = find(parties, (p) => /^rep/i.test(p.abbrev)).id;
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
        <div>
          <div style={{ fontSize: '8pt' }}>For</div>
          <h3 style={{ marginBottom: '0.125rem' }}>
            {electionStrings.contestTitle(contest)}
          </h3>
          <div style={{ fontSize: '8.75pt' }}>{voteForText}</div>
          {willBeElectedText && (
            <div style={{ fontSize: '8.75pt' }}>{willBeElectedText}</div>
          )}
          {contest.termDescription && (
            <div>{electionStrings.contestTerm(contest)}</div>
          )}
        </div>
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
                    height: '3rem',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      alignSelf: 'start',
                      flex: 1,
                      fontSize: '7.5pt',
                      padding: '0.125rem',
                      textAlign: 'right',
                      lineHeight: 1,
                      marginTop: '1.5rem',
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
    <div style={{ textAlign: 'center' }}>
      <h2>Constitutional Amendment Questions</h2>
      <h3>Constitutional Amendments Proposed by the General Court </h3>
    </div>
  );
}

function BallotMeasureContest({ contest }: { contest: YesNoContest }) {
  return (
    <div>
      <div
        style={{
          paddingTop: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
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
          justifyContent: 'end',
          gap: '3rem',
        }}
      >
        {[contest.yesOption, contest.noOption].map((option) => (
          <li key={option.id}>
            <div
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              <h3>{electionStrings.contestOptionLabel(option)}</h3>
              <AlignedBubble
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
  props: (NhGeneralBallotProps & { dimensions: PixelDimensions }) | undefined,
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
              paddingBottom: '0.125rem',
              borderBottom:
                pageSections.length === 0
                  ? `2.5px solid ${Colors.BLACK}`
                  : 'none',
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

export type NhGeneralBallotProps = BaseBallotProps;

export const nhGeneralBallotTemplate: BallotPageTemplate<NhGeneralBallotProps> =
  {
    frameComponent: BallotPageFrame,
    contentComponent: BallotPageContent,
    stylesComponent: NhBaseStyles,
  };
