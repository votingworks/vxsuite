import React from 'react';
import { Buffer } from 'node:buffer';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  err,
  find,
  groupBy,
  iter,
  ok,
  range,
  Result,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import {
  BallotMode,
  ballotPaperDimensions,
  BallotStyle,
  BallotType,
  Candidate,
  CandidateContest as CandidateContestStruct,
  Contest as ContestStruct,
  ContestId,
  Election,
  getBallotStyle,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  getPrecinctById,
  Party,
  PartyId,
  Precinct,
  straightPartyNotYetImplemented,
  YesNoContest,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  electionStrings,
  RichText,
} from '@votingworks/ui';
import { css } from 'styled-components';
import { styled } from '../styled.js';
import {
  primaryLanguageCode,
  Page,
  pageMarginsInches,
  TimingMarkGrid,
  Colors,
  OptionInfo,
  AlignedBubble,
  BALLOT_MEASURE_OPTION_CLASS,
  CANDIDATE_OPTION_CLASS,
  EXPANDABLE_WRITE_IN_OPTION_CLASS,
  WRITE_IN_OPTION_CLASS,
} from '../ballot_components.js';
import { ContentComponentResult, BallotLayoutError } from '../render_ballot.js';
import { Watermark } from './watermark.js';
import { PixelDimensions } from '../types.js';
import { layOutInColumns } from '../layout_in_columns.js';
import { RenderScratchpad } from '../renderer.js';
import {
  allCaps,
  HandCountInsignia,
  Instructions,
  Footer,
  NhStateBallotProps,
  NhStateBallotVariant,
  isDemocraticParty,
  isRepublicanParty,
} from './nh_state_ballot_components.js';

export function Header({
  election,
  precinct,
  ballotType,
  ballotMode,
  variant,
}: {
  election: Election;
  precinct?: Precinct;
  ballotType: BallotType;
  ballotMode: BallotMode;
  variant?: NhStateBallotVariant;
}): JSX.Element {
  const isAbsentee = ballotType === 'absentee';
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
          padding: '0 0.5rem',
        }}
      >
        <h5
          style={{
            visibility: variant === 'federalOfficeOnly' ? 'visible' : 'hidden',
          }}
        >
          FEDERAL OFFICE ONLY
        </h5>
        <h5 style={{ visibility: isAbsentee ? 'visible' : 'hidden' }}>
          ABSENTEE
        </h5>
        <h5
          // @coverage-defer
          style={{ visibility: ballotMode === 'sample' ? 'hidden' : 'visible' }}
        >
          {ballotTitle} FOR
        </h5>
        {/* Sized so that the longest NH city and ward stay on one line. */}
        <h1 style={{ fontSize: precinct ? '15pt' : '18pt' }}>
          {electionStrings.jurisdictionName(election.jurisdiction)}
          {precinct && <> {electionStrings.precinctName(precinct)}</>}
        </h1>
        <h3>
          {variant === 'federalOfficeOnly'
            ? 'Federal General Election'
            : electionStrings.electionTitle(election)}
        </h3>
        <h3>{electionStrings.electionDate(election)}</h3>
      </div>
      {ballotMode === 'sample' ? (
        // @coverage-defer
        <div
          style={{
            width: '1.2in',
            height: '1.2in',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            justifySelf: 'center',
          }}
        >
          <div
            style={{
              fontSize: '26pt',
              fontWeight: 'bold',
              lineHeight: 1,
            }}
          >
            SAMPLE
          </div>
        </div>
      ) : (
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
          <div
            style={{
              height: '0.4in',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
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
      )}
    </div>
  );
}

export function BallotPageFrame({
  election,
  ballotStyleId,
  precinctId,
  ballotType,
  ballotMode,
  pageNumber,
  totalPages,
  children,
  watermark,
  isHandCount,
  variant,
}: NhStateBallotProps & {
  pageNumber: number;
  totalPages?: number;
  children: JSX.Element;
}): Result<JSX.Element, BallotLayoutError> {
  // @coverage-defer
  if (!election.signature) {
    return err({ error: 'missingSignature' });
  }

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
        {/* @coverage-defer */}
        {watermark && <Watermark>{watermark}</Watermark>}
        <TimingMarkGrid
          pageDimensions={pageDimensions}
          hideTimingMarks={
            ballotMode === 'sample' || isHandCount || variant !== undefined
          }
        >
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
                  precinct={
                    // In cities, the header names the ward alongside the city.
                    election.precincts.length > 1
                      ? assertDefined(getPrecinctById({ election, precinctId }))
                      : undefined
                  }
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                  variant={variant}
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
              {isHandCount && !variant && (
                <HandCountInsignia
                  pageNumber={pageNumber}
                  totalPages={totalPages}
                  election={election}
                  ballotType={ballotType}
                  ballotMode={ballotMode}
                />
              )}
            </div>
            <Footer
              jurisdictionName={electionStrings.jurisdictionName(
                election.jurisdiction
              )}
              pageNumber={pageNumber}
              totalPages={totalPages}
              ballotMode={ballotMode}
              isHandCount={isHandCount}
              variant={variant}
            />
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

const CANDIDATE_COLUMNS = ['democratic', 'republican', 'other'] as const;

type CandidateColumn = (typeof CANDIDATE_COLUMNS)[number];

function candidateColumnHeading(column: CandidateColumn): JSX.Element {
  switch (column) {
    case 'democratic':
      return <>Democratic Candidates</>;
    case 'republican':
      return <>Republican Candidates</>;
    case 'other':
      return (
        <>
          Other
          <br />
          Candidates
        </>
      );
    default:
      return throwIllegalValue(column);
  }
}

function candidateColumn(
  candidate: Candidate,
  democraticPartyId: PartyId,
  republicanPartyId: PartyId
): CandidateColumn {
  switch (candidate.partyIds?.[0]) {
    case democraticPartyId:
      return 'democratic';
    case republicanPartyId:
      return 'republican';
    default:
      return 'other';
  }
}

function candidateColumnOrder({
  election,
  ballotStyle,
}: {
  election: Election;
  ballotStyle: BallotStyle;
}): CandidateColumn[] {
  const democraticPartyId = find(election.parties, isDemocraticParty).id;
  const republicanPartyId = find(election.parties, isRepublicanParty).id;
  const columnSequences = getContests({ election, ballotStyle })
    .filter((contest) => contest.type === 'candidate')
    .map((contest) =>
      unique(
        getOrderedCandidatesForContestInBallotStyle({
          contest,
          ballotStyle,
        }).map((candidate) =>
          candidateColumn(candidate, democraticPartyId, republicanPartyId)
        )
      )
    );

  return [...CANDIDATE_COLUMNS].sort((columnA, columnB) => {
    const relativeOrders = unique(
      columnSequences
        .filter(
          (sequence) => sequence.includes(columnA) && sequence.includes(columnB)
        )
        .map((sequence) =>
          Math.sign(sequence.indexOf(columnA) - sequence.indexOf(columnB))
        )
    );
    assert(
      relativeOrders.length <= 1,
      `Contests disagree on whether the ${columnA} or ${columnB} column comes first`
    );
    return relativeOrders[0] ?? 0;
  });
}

function CandidateContestSectionHeader({
  columnOrder,
}: {
  columnOrder: readonly CandidateColumn[];
}): JSX.Element {
  return (
    <CandidateContestSectionHeaderContainer>
      <div>Offices</div>
      {columnOrder.map((column) => (
        <div key={column}>{candidateColumnHeading(column)}</div>
      ))}
      <div>Write-in Candidates</div>
    </CandidateContestSectionHeaderContainer>
  );
}

const CandidateContestRow = styled.div`
  ${rowStyles}
  border-bottom: 2.5px solid ${Colors.BLACK};
  > div:not(:last-child) {
    border-right: 1px solid ${Colors.BLACK};
  }
`;

const CandidateListCell = styled.div`
  line-height: 1;
`;

const ContestTitleCell = styled.div`
  line-height: 1;
  text-align: center;
  min-width: 0;
  padding: 0.375rem 0.25rem;
  display: flex;
  align-items: center;
`;

const OptionList = styled.div<{
  positioning: 'center' | 'topOffset' | 'top';
}>`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: ${(props) =>
    props.positioning === 'topOffset' ? '1.5rem' : undefined};
  justify-content: ${(props) =>
    props.positioning === 'center' ? 'center' : 'start'};
  gap: 0.5rem;
`;

function CandidateList({
  contestId,
  candidates,
  party,
  positioning,
}: {
  contestId: ContestId;
  candidates: Candidate[];
  party?: Party;
  positioning: 'center' | 'topOffset' | 'top';
}) {
  return (
    <OptionList positioning={positioning} style={{ gap: '0.5rem' }}>
      {candidates.map((candidate) => {
        const optionInfo: OptionInfo = {
          type: 'option',
          contestId,
          optionId: candidate.id,
        };
        return (
          <div
            key={candidate.id}
            className={CANDIDATE_OPTION_CLASS}
            style={{
              padding: '0.375rem 0.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: '3rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '0.25rem',
                justifyContent: 'end',
                textAlign: 'right',
                alignItems: 'center',
                height: '100%',
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
                      top: '-1em',
                    }}
                  >
                    {electionStrings.partyName(party)}
                  </div>
                )}
                <h3>{electionStrings.candidateName(candidate)}</h3>
              </div>
              <div style={{ alignSelf: 'start', marginTop: '0.6rem' }}>
                <AlignedBubble optionInfo={optionInfo} />
              </div>
            </div>
          </div>
        );
      })}
    </OptionList>
  );
}

function CandidateContest({
  election,
  contest,
  ballotStyle,
  columnOrder,
}: {
  election: Election;
  contest: CandidateContestStruct;
  ballotStyle: BallotStyle;
  columnOrder: readonly CandidateColumn[];
}) {
  const seatsWord = {
    2: 'Two',
    3: 'Three',
    4: 'Four',
    5: 'Five',
    6: 'Six',
    7: 'Seven',
    8: 'Eight',
    9: 'Nine',
    10: 'Ten',
  }[contest.seats];

  const candidatesByParty = groupBy(
    getOrderedCandidatesForContestInBallotStyle({ contest, ballotStyle }),
    (candidate) => candidate.partyIds?.[0]
  );
  const { parties } = election;
  const democraticPartyId = find(parties, isDemocraticParty).id;
  const republicanPartyId = find(parties, isRepublicanParty).id;
  const democraticCandidates =
    candidatesByParty.find(([partyId]) => partyId === democraticPartyId)?.[1] ??
    [];
  const republicanCandidates =
    candidatesByParty.find(([partyId]) => partyId === republicanPartyId)?.[1] ??
    [];
  const otherCandidateGroups = candidatesByParty.filter(
    ([partyId]) =>
      !(partyId === democraticPartyId || partyId === republicanPartyId)
  );

  // When there are multiple bubbles in any party column, they must be
  // vertically offset with bubbles in adjacent columns.
  function positioning(columnIndex: number) {
    if (contest.seats === 1) {
      return 'center' as const;
    }
    return columnIndex % 2 === 0 ? ('topOffset' as const) : ('top' as const);
  }
  const writeInCandidatesPositioning = positioning(columnOrder.length);

  function columnCandidateLists(column: CandidateColumn, columnIndex: number) {
    switch (column) {
      case 'democratic':
        return (
          <CandidateList
            contestId={contest.id}
            candidates={democraticCandidates}
            positioning={positioning(columnIndex)}
          />
        );
      case 'republican':
        return (
          <CandidateList
            contestId={contest.id}
            candidates={republicanCandidates}
            positioning={positioning(columnIndex)}
          />
        );
      case 'other':
        return otherCandidateGroups.map(([partyId, candidates]) => (
          <div key={partyId} style={{ height: '100%' }}>
            <CandidateList
              contestId={contest.id}
              candidates={candidates}
              party={parties.find((p) => p.id === partyId)}
              positioning={positioning(columnIndex)}
            />
          </div>
        ));
      default:
        return throwIllegalValue(column);
    }
  }

  return (
    <CandidateContestRow>
      <ContestTitleCell>
        <div>
          <div style={{ fontSize: '8pt' }}>For</div>
          <h3 style={{ marginBottom: '0.125rem' }}>
            {electionStrings.contestTitle(contest)}
          </h3>
          <div style={{ fontSize: '8.75pt' }}>
            {contest.seats === 1 ? (
              <>
                Vote for not more than <strong>1</strong>
              </>
            ) : (
              <>
                Vote for up to <strong>{contest.seats}</strong>;
                <br />
                <strong>{seatsWord}</strong> will be elected
              </>
            )}
          </div>
          {contest.termDescription && (
            // @coverage-defer
            <div>{electionStrings.contestTerm(contest)}</div>
          )}
        </div>
      </ContestTitleCell>
      {columnOrder.map((column, columnIndex) => (
        <CandidateListCell key={column}>
          {columnCandidateLists(column, columnIndex)}
        </CandidateListCell>
      ))}
      <CandidateListCell>
        <OptionList positioning={writeInCandidatesPositioning}>
          {contest.allowWriteIns &&
            range(0, contest.seats).map((writeInIndex) => {
              const optionInfo: OptionInfo = {
                type: 'write-in',
                contestId: contest.id,
                writeInIndex,
                writeInArea: {
                  top: 0.75,
                  left: 4.9,
                  bottom: 0.08,
                  right: -0.6,
                },
              };
              return (
                <div
                  key={writeInIndex}
                  className={[
                    WRITE_IN_OPTION_CLASS,
                    EXPANDABLE_WRITE_IN_OPTION_CLASS,
                  ].join(' ')}
                  style={{
                    display: 'flex',
                    padding: '0.375rem',
                    height: '3rem',
                    marginBottom:
                      contest.seats > 1 && writeInIndex === contest.seats - 1
                        ? '0.75rem'
                        : undefined,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      fontSize: '7.5pt',
                      padding: '0.125rem',
                      textAlign: 'right',
                      lineHeight: 1,
                      marginTop: '1.5rem',
                    }}
                  >
                    {contest.title ===
                    'President and Vice-President of the United States' ? (
                      <>
                        President and{' '}
                        <span style={{ whiteSpace: 'nowrap' }}>
                          Vice-President
                        </span>
                      </>
                    ) : (
                      contest.title
                    )}
                  </div>
                  <div style={{ marginTop: '0.6rem' }}>
                    <AlignedBubble optionInfo={optionInfo} />
                  </div>
                </div>
              );
            })}
        </OptionList>
      </CandidateListCell>
    </CandidateContestRow>
  );
}

/**
 * The heading NH prints above the ballot measure section. It's not part of the
 * election definition, so it's hardcoded here and validated against the NH
 * source files during conversion.
 */
export function nhBallotMeasureContestSectionHeader(
  electionDate: DateWithoutTime
): string {
  const [year] = electionDate.toISOString().split('-');
  return `QUESTIONS RELATING TO CONSTITUTIONAL AMENDMENTS PROPOSED BY THE ${year} GENERAL COURT`;
}

function BallotMeasureContestSectionHeader({
  election,
}: {
  election: Election;
}) {
  return (
    <h3 style={{ textAlign: 'center' }}>
      {nhBallotMeasureContestSectionHeader(election.date)}
    </h3>
  );
}

// A ballot measure description may open with a heading (e.g. the statute
// requiring the question), which NH centers above the question text.
const BallotMeasureDescription = styled(RichText)`
  flex: 1;

  h4 {
    margin: 0 0 0.5em;
    text-align: center;
  }
`;

function BallotMeasureContest({ contest }: { contest: YesNoContest }) {
  return (
    <div>
      <div
        style={{
          paddingTop: '1rem',
          display: 'flex',
          flexDirection: 'row',
          gap: '0.25rem',
        }}
      >
        <BallotMeasureDescription
          tableBorderWidth={'1px'}
          tableBorderColor={Colors.DARKER_GRAY}
          tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
        >
          {electionStrings.contestDescription(contest)}
        </BallotMeasureDescription>
      </div>
      <ul
        style={{
          display: 'flex',
          justifyContent: 'end',
          gap: '3rem',
        }}
      >
        {contest.options.map((option) => (
          <li key={option.id} className={BALLOT_MEASURE_OPTION_CLASS}>
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

export async function BallotPageContent(
  props: NhStateBallotProps & { dimensions: PixelDimensions },
  contests: readonly ContestStruct[],
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult> {
  if (contests.length === 0) {
    return ok({
      currentPageElement: <React.Fragment />,
      leftoverContests: [],
    });
  }

  const { election, ballotStyleId, dimensions } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const columnOrder = candidateColumnOrder({ election, ballotStyle });

  // One section for candidate contests, one for ballot measures.
  const contestSections = iter(contests)
    .partition((contest) => contest.type === 'candidate')
    .filter((section) => section.length > 0);

  // Add as many contests on this page as will fit.
  const pageSections: JSX.Element[] = [];
  const sectionGapPx = 20;
  let heightUsed = 0;

  while (contestSections.length > 0 && heightUsed < dimensions.height) {
    const section = assertDefined(contestSections.shift());
    const contestElements = section.map((contest) => {
      // @coverage-exclude
      if (contest.type === 'straight-party') {
        return straightPartyNotYetImplemented();
      }
      return contest.type === 'candidate' ? (
        <CandidateContest
          key={contest.id}
          contest={contest}
          election={election}
          ballotStyle={ballotStyle}
          columnOrder={columnOrder}
        />
      ) : (
        <BallotMeasureContest key={contest.id} contest={contest} />
      );
    });
    const sectionHeader =
      section[0].type === 'candidate' ? (
        <CandidateContestSectionHeader columnOrder={columnOrder} />
      ) : (
        <BallotMeasureContestSectionHeader election={election} />
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
      .toArray();

    const { columns, height, leftoverElements } = layOutInColumns({
      elements: measuredContests,
      numColumns: 1,
      maxColumnHeight: dimensions.height - heightUsed,
    });

    // If ballot measures don't all fit in the room left on this page, move the
    // whole section to the next page rather than splitting it. If the current
    // page is empty, there is nowhere further to defer to so lay out whatever
    // fits.
    const isBallotMeasureSection = section[0].type !== 'candidate';
    if (
      isBallotMeasureSection &&
      leftoverElements.length > 0 &&
      heightUsed > 0
    ) {
      contestSections.unshift(section);
      break;
    }

    // Put contests we didn't lay out back on the front of the queue
    if (leftoverElements.length > 0) {
      contestSections.unshift(section.slice(-leftoverElements.length));
    }

    // If there wasn't enough room left for any contests, go to the next page
    const onlyHeaderFit = leftoverElements.length === section.length;
    if (height === 0 || onlyHeaderFit) {
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

  const leftoverContests = contestSections.flat();
  if (heightUsed === 0) {
    return err({
      error: 'contestTooLong',
      contest: leftoverContests[0],
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
      // @coverage-defer
      <React.Fragment />
    );

  return ok({
    currentPageElement,
    leftoverContests,
  });
}
