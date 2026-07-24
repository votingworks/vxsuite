/* istanbul ignore file - DEMO */
import React from 'react';
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
  Contest as ContestStruct,
  BallotMode,
  BallotStyle,
  BallotStyleId,
  BaseBallotProps,
  CandidateContest as CandidateContestStruct,
  ContestNominationType,
  DEFAULT_LANGUAGE_CODE,
  District,
  Election,
  PrecinctId,
  YesNoContest,
  ballotPaperDimensions,
  getBallotStyle,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import {
  BackendLanguageContextProvider,
  electionStrings,
  InEnglish,
  RichText,
  useLanguageContext,
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
  DualLanguageText,
  Instructions,
  Footer,
  Colors,
  WriteInLabel,
  BlankPageMessage,
  AlignedBubble,
  CANDIDATE_OPTION_CLASS,
  BALLOT_MEASURE_OPTION_CLASS,
} from '../ballot_components';
import { PixelDimensions, PixelMeasurements } from '../types';
import { Section, layOutSectionsInColumns } from '../layout_in_columns';
import { hmpbStrings } from '../hmpb_strings';
import { ArrowRight } from '../svg_assets';
import { Watermark } from './watermark';
import { BaseStyles as BaseStylesComponent } from '../base_styles';

// The CA ballot template loosely follows Santa Clara County's ballot design:
// a dense grid-like layout (no padding between contest columns), contests
// grouped into party-nominated/voter-nominated/nonpartisan/measure sections,
// and support for laying out large contests as multi-column grids within a
// single contest box.

const NUM_PAGE_COLUMNS = 3;

const Box = styled.div`
  border: 1px solid ${Colors.BLACK};
  /* Collapse vertical borders between stacked boxes */
  &:not(:first-child) {
    border-top: none;
  }
`;

const ContestColumn = styled.div`
  flex: 1;
  /* Keep columns equal width even if content's min-content size is wider
   * (e.g. long unbreakable text runs) */
  min-width: 0;
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

// Section/subsection/contest headers form a hierarchy of descending gray
// tints with black text throughout, like the official Santa Clara County
// ballots (unlike the MI template's inverse white-on-dark section bands).
const SectionTitleBand = styled(Box)`
  background: ${Colors.DARKER_GRAY};
  text-align: center;
  font-weight: bold;
  font-size: 11pt;
  padding: 0.25rem 0.5rem;
`;

const SectionExplanation = styled(Box)`
  font-size: 8pt;
  line-height: 1.2;
  padding: 0.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const SubsectionHeader = styled(Box)`
  background: ${Colors.DARK_GRAY};
  text-align: center;
  font-weight: bold;
  font-size: 10pt;
  padding: 0.25rem 0.5rem;
`;

const ContestHeader = styled.div`
  background: ${Colors.LIGHT_GRAY};
  text-align: center;
  font-weight: bold;
  font-size: 10pt;
  padding: 0.125rem 0.5rem;
  border-bottom: 1px solid ${Colors.BLACK};
`;

const VoteFor = styled.div`
  text-align: center;
  font-weight: normal;
  font-size: 8pt;
`;

// The "Vote for N" instruction sits in its own unshaded strip below the
// contest title band, right-aligned with the languages stacked, like the
// official Santa Clara County ballots
const VoteForRow = styled.div`
  text-align: right;
  font-size: 8pt;
  line-height: 1.2;
  padding: 0.125rem 0.5rem;
  border-bottom: 1px solid ${Colors.BLACK};
`;

const OptionsGrid = styled.ul<{ columns: number; rows: number }>`
  display: grid;
  /* minmax(0, 1fr) keeps tracks equal width even if content's min-content
   * size is wider (e.g. long unbreakable text runs) */
  grid-template-columns: repeat(${(p) => p.columns}, minmax(0, 1fr));

  /* Candidates flow down each column in order (column-major), rather than
   * across the rows */
  grid-template-rows: repeat(${(p) => p.rows}, auto);
  grid-auto-flow: column;

  /* Break within words as a last resort rather than overflowing the cell */
  overflow-wrap: break-word;

  > li {
    border-top: 1px solid ${Colors.DARK_GRAY};
  }

  /* First row of cells sits directly below the contest header */
  > li:nth-child(${(p) => p.rows}n + 1) {
    border-top: none;
  }

  /* Vertical rules between grid columns */
  > li:not(:nth-child(-n + ${(p) => p.rows})) {
    border-left: 1px solid ${Colors.DARK_GRAY};
  }
`;

const OptionRow = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 9pt;
  line-height: 1.1;

  /* Align the top of the bubble with the visual top (cap height) of the
   * option label's first line */
  > *:first-child {
    margin-top: 2px;
  }
`;

const OptionLabel = styled.div`
  font-weight: bold;
`;

const OptionSubtitle = styled.div`
  font-size: 7.25pt;
  line-height: 1.1;
  /* Lighter ink than the candidate names so the names stand out at this
   * density, like the official Santa Clara County ballots */
  color: ${Colors.INVERSE_GRAY};

  /* When a long line wraps, hang continuation lines under the text start */
  > div {
    padding-left: 0.6em;
    text-indent: -0.6em;
  }
`;

const WriteInCaption = styled(OptionSubtitle)`
  /* Keep the caption's ascenders clear of the write-in line above it */
  margin-top: 3px;

  > div {
    padding-left: 0;
    text-indent: 0;
  }
`;

// Renders English stacked over its translation, each on its own line. Used
// for headers of contests in the narrow (1/3-width) column flow, where text
// wraps: the shared inline "/" delimiter (DualLanguageText's delimiter mode)
// mis-renders a stray leading separator when centered text wraps.
function DualLanguageHeading({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <DualLanguageText>
      <div>{children}</div>
    </DualLanguageText>
  );
}

// Renders "English / Translation" on one line. Used for headers of full-width
// grid contests, which have plenty of horizontal room — matching the official
// Santa Clara County ballot style.
function DualLanguageInlineHeading({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const languageContext = useLanguageContext();
  if (!languageContext || languageContext.currentLanguageCode === 'en') {
    return <div>{children}</div>;
  }
  return (
    <div>
      <InEnglish>{children}</InEnglish>
      {' / '}
      {children}
    </div>
  );
}

function nominationTypeOf(
  contest: CandidateContestStruct
): ContestNominationType {
  return contest.nominationType ?? 'voter-nominated';
}

function contestGridColumns(contest: ContestStruct): number {
  return contest.type === 'candidate' ? contest.candidateColumns ?? 1 : 1;
}

function Header({
  election,
  ballotStyleId,
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

  // CA header requirements: "Official Ballot" in at least 16pt bold, election
  // name in at least 12pt bold, election date in at least 12pt, county name in
  // at least 8pt.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <DualLanguageText delimiter="/">
        <div
          style={{
            fontSize: '16pt',
            fontWeight: 'bold',
            textTransform: 'uppercase',
          }}
        >
          {ballotTitle}
        </div>
      </DualLanguageText>
      {party && (
        <div style={{ fontSize: '12pt', fontWeight: 'bold' }}>
          <DualLanguageText delimiter="/">
            {electionStrings.partyFullName(party)}
          </DualLanguageText>
        </div>
      )}
      <div style={{ fontSize: '12pt', fontWeight: 'bold' }}>
        <DualLanguageText delimiter="/">
          {electionStrings.electionTitle(election)}
        </DualLanguageText>
      </div>
      <div style={{ fontSize: '12pt' }}>
        <DualLanguageText delimiter="/">
          {electionStrings.electionDate(election)}
        </DualLanguageText>
      </div>
      <div style={{ fontSize: '9pt' }}>
        <DualLanguageText delimiter="/">
          <span>
            {electionStrings.jurisdictionName(election.jurisdiction)},{' '}
            {electionStrings.stateName(election)}
          </span>
        </DualLanguageText>
      </div>
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
  const languageCode = primaryLanguageCode(ballotStyle);
  return ok(
    <BackendLanguageContextProvider
      key={pageNumber}
      currentLanguageCode={languageCode}
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
          hideTimingMarks={ballotMode === 'sample'}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
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
                {/* The first section's header block sits flush against the
                    bottom of the instructions box, like the official Santa
                    Clara County ballots */}
                <div style={{ margin: '0.5rem 0 0' }}>
                  <Instructions languageCode={languageCode} />
                </div>
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
            <div style={{ fontSize: '12pt', marginTop: '0.5rem' }}>
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

function CandidatePartyPreference({
  election,
  contest,
  candidate,
}: {
  election: Election;
  contest: CandidateContestStruct;
  candidate: { partyIds?: readonly string[] };
}) {
  const nominationType = nominationTypeOf(contest);
  const party = candidate.partyIds?.length
    ? find(election.parties, (p) => p.id === candidate.partyIds?.[0])
    : undefined;
  switch (nominationType) {
    case 'voter-nominated':
      return (
        <OptionSubtitle>
          <DualLanguageText>
            <div>
              {hmpbStrings.hmpbPartyPreference}:{' '}
              {party ? (
                electionStrings.partyName(party)
              ) : (
                <span>{hmpbStrings.hmpbNone}</span>
              )}
            </div>
          </DualLanguageText>
        </OptionSubtitle>
      );
    case 'party-nominated':
      return party ? (
        <OptionSubtitle>
          <DualLanguageText>
            <div>{electionStrings.partyName(party)}</div>
          </DualLanguageText>
        </OptionSubtitle>
      ) : null;
    case 'nonpartisan':
      return null;
    default:
      /* istanbul ignore next */
      return throwIllegalValue(nominationType);
  }
}

// Write-in area coordinates (in timing mark grid units, relative to the
// bubble) for each contest grid column count. Wider cells get longer
// write-in lines extending right from the left-side bubble.
function writeInAreaForColumns(numGridColumns: number): {
  top: number;
  left: number;
  bottom: number;
  right: number;
} {
  const right = { 1: 8.7, 2: 14.0, 3: 9.0, 4: 6.5 }[numGridColumns];
  if (right === undefined) {
    throw new Error(
      `Unsupported number of contest grid columns: ${numGridColumns}`
    );
  }
  // The area covers the blank writing space, from the right edge of the
  // top-aligned bubble to just short of the cell's right edge (calibrated
  // against the rendered cell geometry). In single-column contests the
  // write-in line sits beside the bubble; in grid cells the bubble is at the
  // top of the (taller) cell with the line pinned to the bottom, so the
  // area extends further down.
  return numGridColumns === 1
    ? { top: 0.4, left: -0.5, bottom: 0.55, right }
    : { top: 0.4, left: -0.5, bottom: 2, right };
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
  const gridColumns = contestGridColumns(contest);
  const primaryLanguage = primaryLanguageCode(ballotStyle);
  // Transliterated candidate names, looked up directly from the election's
  // ballot strings in the ballot's primary language. Candidate names are
  // intentionally non-translatable in the standard string pipeline
  // (`candidateName` strings are always English), so ballots that display a
  // transliterated name (e.g. Hindi, Khmer) rely on hand-authored fixture
  // strings under the same key.
  function translatedCandidateString(
    key: string,
    candidateId: string
  ): string | undefined {
    if (primaryLanguage === 'en') {
      return undefined;
    }
    const strings = election.ballotStrings[primaryLanguage]?.[key];
    return strings && typeof strings === 'object'
      ? (strings as Record<string, string>)[candidateId]
      : undefined;
  }
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

  const numWriteIns = contest.allowWriteIns ? contest.seats : 0;
  const numCells = candidates.length + numWriteIns;
  const numGridRows = Math.ceil(numCells / gridColumns);
  // Fill out the last grid column with empty bordered cells
  const numFillerCells = numGridRows * gridColumns - numCells;

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ContestHeader>
        {gridColumns > 1 ? (
          <DualLanguageInlineHeading>
            {electionStrings.contestTitle(contest)}
          </DualLanguageInlineHeading>
        ) : (
          <DualLanguageHeading>
            {electionStrings.contestTitle(contest)}
          </DualLanguageHeading>
        )}
        {contest.termDescription && (
          <VoteFor>
            <DualLanguageInlineHeading>
              {electionStrings.contestTerm(contest)}
            </DualLanguageInlineHeading>
          </VoteFor>
        )}
      </ContestHeader>
      <VoteForRow>
        <DualLanguageHeading>{voteForText}</DualLanguageHeading>
      </VoteForRow>
      <OptionsGrid columns={gridColumns} rows={numGridRows}>
        {candidates.map((candidate) => {
          const optionInfo: OptionInfo = {
            type: 'option',
            contestId: contest.id,
            optionId: candidate.id,
            partyIds: candidate.partyIds,
          };
          const translatedName = translatedCandidateString(
            'candidateName',
            candidate.id
          );
          return (
            <li
              key={candidate.id}
              className={CANDIDATE_OPTION_CLASS}
              style={{ padding: '0.125rem 0.375rem 0.1875rem' }}
            >
              <OptionRow>
                <AlignedBubble compact optionInfo={optionInfo} />
                <div>
                  <OptionLabel>
                    {electionStrings.candidateName(candidate)}
                  </OptionLabel>
                  {/* Transliterated candidate name, for ballot languages that
                      display one (e.g. Hindi, Chinese) — regular weight,
                      like the official Santa Clara County ballots. The small
                      bottom margin keeps scripts with deep descenders (e.g.
                      Khmer subscripts) clear of the party preference line
                      below. */}
                  {translatedName && (
                    <div style={{ marginBottom: '2px' }}>{translatedName}</div>
                  )}
                  <CandidatePartyPreference
                    election={election}
                    contest={contest}
                    candidate={candidate}
                  />
                  {candidate.designation && (
                    <OptionSubtitle>
                      <DualLanguageText>
                        <div>
                          {electionStrings.candidateDesignation(candidate)}
                        </div>
                      </DualLanguageText>
                    </OptionSubtitle>
                  )}
                </div>
              </OptionRow>
            </li>
          );
        })}
        {range(0, numWriteIns).map((writeInIndex) => {
          const optionInfo: OptionInfo = {
            type: 'write-in',
            contestId: contest.id,
            writeInIndex,
            writeInArea: writeInAreaForColumns(gridColumns),
          };
          return (
            <li
              key={`write-in-${writeInIndex}`}
              className={WRITE_IN_OPTION_CLASS}
              style={{
                padding: '0.125rem 0.5rem 0.1875rem',
                display: 'flex',
              }}
            >
              {/* In a grid, the row can be taller than the write-in content
                  (sized by candidate cells beside it): the bubble aligns to
                  the top of the cell like the candidate cells' bubbles, while
                  the write-in line and caption stay pinned to the bottom,
                  the same distance from the box edge as a normal-height
                  cell */}
              <OptionRow style={{ flex: 1 }}>
                <AlignedBubble compact optionInfo={optionInfo} />
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      borderBottom: `1px solid ${Colors.BLACK}`,
                      height: '1.5rem',
                    }}
                  />
                  <WriteInCaption>
                    <WriteInLabel />
                  </WriteInCaption>
                </div>
              </OptionRow>
            </li>
          );
        })}
        {range(0, numFillerCells).map((i) => (
          <li
            key={`filler-${i}`}
            style={{
              padding: '0.75rem 0.5rem',
              textAlign: 'center',
              fontSize: '8pt',
              fontWeight: 'bold',
            }}
          >
            {/* Mark the end of the contest in the grid's last cell, like the
                official Santa Clara County ballots ("End of Governor
                Contest" / "राज्यपाल चुनाव समाप्त") */}
            {i === numFillerCells - 1 && (
              <DualLanguageText>
                <div style={{ marginBottom: '0.5rem' }}>
                  {hmpbStrings.hmpbCaEndOfContestStart}{' '}
                  {electionStrings.contestTitle(contest)}{' '}
                  {hmpbStrings.hmpbCaEndOfContestEnd}
                </div>
              </DualLanguageText>
            )}
          </li>
        ))}
      </OptionsGrid>
    </Box>
  );
}

// Santa Clara County measure descriptions start with the measure's
// designation (e.g. the "B" in "B To renew local school funding..."), printed
// in a larger bold font. We assume the first word of the description is the
// designation, as long as it looks like one (a short all-caps/numeric token).
const MEASURE_DESIGNATION_PATTERN = /^[0-9A-Z]{1,3}$/;
// Any leading tags/whitespace, then the first word, then trailing whitespace
const LEADING_WORD_PATTERN = /^((?:<[^>]*>|\s)*)([^\s<]+)\s*/;

/**
 * Emphasizes the measure designation at the start of the English description,
 * like the official Santa Clara County ballots. In translated descriptions,
 * drops the designation if the translation kept it (and only if it exactly
 * matches the English designation), since the emphasized English designation
 * shown directly above already identifies the measure.
 */
function transformMeasureDescription(contest: YesNoContest) {
  return (html: string, languageCode: string): string => {
    const designation = contest.description.match(LEADING_WORD_PATTERN)?.[2];
    if (!designation || !MEASURE_DESIGNATION_PATTERN.test(designation)) {
      return html;
    }
    const match = html.match(LEADING_WORD_PATTERN);
    if (!match || match[2] !== designation) {
      return html;
    }
    const [matched, leadingTags] = match;
    const rest = html.slice(matched.length);
    if (languageCode !== DEFAULT_LANGUAGE_CODE) {
      return `${leadingTags}${rest}`;
    }
    return `${leadingTags}<span style="font-size: 2em; line-height: 1; font-weight: bold;">${designation}</span> ${rest}`;
  };
}

function BallotMeasureContest({ contest }: { contest: YesNoContest }) {
  return (
    <Box>
      <ContestHeader>
        <DualLanguageHeading>
          {electionStrings.contestTitle(contest)}
        </DualLanguageHeading>
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
            fontSize: '9pt',
          }}
        >
          <DualLanguageText>
            <RichText
              tableBorderWidth={'1px'}
              tableBorderColor={Colors.DARKER_GRAY}
              tableHeaderBackgroundColor={Colors.LIGHT_GRAY}
            >
              {electionStrings.contestDescription(contest, {
                transformHtml: transformMeasureDescription(contest),
              })}
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
          {contest.options.map((option) => (
            <li
              key={option.id}
              className={BALLOT_MEASURE_OPTION_CLASS}
              style={{
                padding: '0.375rem 0.5rem',
                borderTop: `1px solid ${Colors.DARK_GRAY}`,
              }}
            >
              <OptionRow>
                <AlignedBubble
                  compact
                  optionInfo={{
                    type: 'option',
                    contestId: contest.id,
                    optionId: option.id,
                  }}
                />
                <OptionLabel>
                  <DualLanguageText delimiter="/">
                    {electionStrings.contestOptionLabel(option)}
                  </DualLanguageText>
                </OptionLabel>
              </OptionRow>
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
  contest: ContestStruct;
  election: Election;
  ballotStyle: BallotStyle;
}) {
  /* istanbul ignore next */
  if (contest.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
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
    default:
      return throwIllegalValue(contest);
  }
}

function SectionHeaderBlock({
  heading,
  inline,
}: {
  heading: SectionHeading;
  inline?: boolean;
}) {
  const Heading = inline ? DualLanguageInlineHeading : DualLanguageHeading;
  return (
    <div>
      <SectionTitleBand>
        <Heading>{heading.title}</Heading>
      </SectionTitleBand>
      {heading.text && (
        <SectionExplanation>
          <DualLanguageText>
            <div>{heading.text}</div>
          </DualLanguageText>
        </SectionExplanation>
      )}
    </div>
  );
}

// Explains that the ballot's first contest starts on the back of the card,
// shown centered in the leftover space on the front when the contest is too
// large to fit below the ballot header and instructions (following the
// official Santa Clara County ballots).
function LargeContestNotice({ contest }: { contest: ContestStruct }) {
  return (
    <div
      style={{
        textAlign: 'center',
        fontSize: '13pt',
        fontWeight: 'bold',
        maxWidth: '75%',
      }}
    >
      {/* Point to the contest on the back of the card, like the official
          Santa Clara County ballots */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <ArrowRight
          fill={Colors.INVERSE_GRAY}
          style={{ width: '11rem', height: '6.6rem' }}
        />
      </div>
      <DualLanguageText>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginBottom: '2rem',
          }}
        >
          <div>
            {hmpbStrings.hmpbCaLargeContestNoticeStart}{' '}
            {electionStrings.contestTitle(contest)}{' '}
            {hmpbStrings.hmpbCaLargeContestNoticeEnd}
          </div>
          <div>
            {hmpbStrings.hmpbCaLargeContestNoticeTurnOver}{' '}
            {electionStrings.contestTitle(contest)}.
          </div>
        </div>
      </DualLanguageText>
    </div>
  );
}

function DistrictSubsectionHeader({
  district,
  inline,
}: {
  district: District;
  inline?: boolean;
}) {
  const Heading = inline ? DualLanguageInlineHeading : DualLanguageHeading;
  return (
    <SubsectionHeader>
      <Heading>{electionStrings.districtName(district)}</Heading>
    </SubsectionHeader>
  );
}

interface ContestElement {
  contest: ContestStruct;
  element: JSX.Element;
}

type ContestSection = Section<JSX.Element, ContestElement>;

// An ordered slice of ballot content: either a run of contests that flow in
// page columns, or a single wide multi-column-grid contest that spans the
// full page width. A grid band carries its section/subsection headers
// separately so the section header can be split off and printed at the
// bottom of the previous page when the contest itself doesn't fit there
// (like the official Santa Clara County ballots).
type Band =
  | { kind: 'columns'; sections: ContestSection[] }
  | {
      kind: 'grid';
      // Set only when sectionHeader is a section's full intro block (not a
      // title-only repeat), enabling it to be split onto the previous page.
      introKey?: string;
      sectionHeader?: JSX.Element;
      subsectionHeader?: JSX.Element;
      contestElement: ContestElement;
    };

type SectionKey =
  | 'party-nominated'
  | 'voter-nominated'
  | 'nonpartisan'
  | 'measures';

function sectionKeyOf(contest: ContestStruct): SectionKey {
  if (contest.type === 'yesno') {
    return 'measures';
  }
  /* istanbul ignore next */
  if (contest.type === 'straight-party') {
    return straightPartyNotYetImplemented();
  }
  return nominationTypeOf(contest);
}

interface SectionHeading {
  title: JSX.Element;
  text?: JSX.Element;
}

interface SectionTemplate {
  key: SectionKey;
  // Title band repeated wherever the section's contests appear after its
  // intro block has been shown.
  title: JSX.Element;
  // The full introductory header block, shown once. Sections may share an
  // intro: the voter-nominated and nonpartisan sections are jointly
  // introduced by a combined "Voter-Nominated and Nonpartisan Offices" block.
  intro: SectionHeading;
  introKey: string;
  contests: ContestStruct[];
}

const VOTER_NOMINATED_AND_NONPARTISAN_INTRO_KEY =
  'voter-nominated-and-nonpartisan';

function introKeyOf(sectionKey: SectionKey): string {
  switch (sectionKey) {
    case 'voter-nominated':
    case 'nonpartisan':
      return VOTER_NOMINATED_AND_NONPARTISAN_INTRO_KEY;
    default:
      return sectionKey;
  }
}

function buildSectionTemplates(
  contests: readonly ContestStruct[]
): SectionTemplate[] {
  const voterNominatedAndNonpartisanIntro: SectionHeading = {
    title: hmpbStrings.hmpbCaVoterNominatedOfficesTitle,
    text: hmpbStrings.hmpbCaVoterNominatedOfficesText,
  };
  const sectionHeadings: Record<
    SectionKey,
    { title: JSX.Element; intro: SectionHeading }
  > = {
    'party-nominated': {
      title: hmpbStrings.hmpbCaPartyNominatedOfficesTitle,
      intro: {
        title: hmpbStrings.hmpbCaPartyNominatedOfficesTitle,
        text: hmpbStrings.hmpbCaPartyNominatedOfficesText,
      },
    },
    'voter-nominated': {
      title: hmpbStrings.hmpbCaVoterNominatedOfficesShortTitle,
      intro: voterNominatedAndNonpartisanIntro,
    },
    nonpartisan: {
      title: hmpbStrings.hmpbCaNonpartisanOfficesTitle,
      intro: voterNominatedAndNonpartisanIntro,
    },
    measures: {
      title: hmpbStrings.hmpbCaMeasuresTitle,
      intro: { title: hmpbStrings.hmpbCaMeasuresTitle },
    },
  };
  const sectionKeys: SectionKey[] = [
    'party-nominated',
    'voter-nominated',
    'nonpartisan',
    'measures',
  ];
  return sectionKeys
    .map((key) => ({
      key,
      ...sectionHeadings[key],
      introKey: introKeyOf(key),
      contests: contests.filter((contest) => sectionKeyOf(contest) === key),
    }))
    .filter((section) => section.contests.length > 0);
}

function buildBands(
  election: Election,
  ballotStyle: BallotStyle,
  contests: readonly ContestStruct[],
  renderedSectionHeaders: ReadonlySet<string>
): Band[] {
  function contestElement(contest: ContestStruct): ContestElement {
    return {
      contest,
      element: (
        <Contest
          contest={contest}
          election={election}
          ballotStyle={ballotStyle}
        />
      ),
    };
  }

  type Run =
    | { grid: false; contests: ContestStruct[] }
    | { grid: true; contest: ContestStruct };

  const bands: Band[] = [];
  // Intros presented by an earlier section during this same page build (the
  // voter-nominated and nonpartisan sections share one intro block).
  const introsUsedThisPage = new Set<string>();
  for (const section of buildSectionTemplates(contests)) {
    // A section's full intro block (title band + explanatory text) only
    // shows once on the ballot. Wherever the section's contests appear after
    // that, just its title band repeats. Headers are kept as data until a
    // run materializes them, since full-width grid bands render them inline
    // ("English / Translation") while column runs render them stacked.
    const presentsIntro =
      !renderedSectionHeaders.has(section.introKey) &&
      !introsUsedThisPage.has(section.introKey);
    if (presentsIntro) {
      introsUsedThisPage.add(section.introKey);
    }
    const heading: SectionHeading = presentsIntro
      ? section.intro
      : { title: section.title };
    let sectionHeaderPending: SectionTemplate | undefined = section;
    for (const [districtId, districtContests] of groupBy(
      section.contests,
      (contest) => contest.districtId
    )) {
      const district = find(election.districts, (d) => d.id === districtId);
      let subsectionHeaderPending: District | undefined = district;

      // Chunk this subsection's contests into runs of normal contests
      // (which flow in page columns) split by wide grid contests.
      const runs: Run[] = [];
      for (const contest of districtContests) {
        const lastRun = runs.at(-1);
        if (contestGridColumns(contest) > 1) {
          runs.push({ grid: true, contest });
        } else if (lastRun && !lastRun.grid) {
          lastRun.contests.push(contest);
        } else {
          runs.push({ grid: false, contests: [contest] });
        }
      }

      for (const run of runs) {
        if (run.grid) {
          bands.push({
            kind: 'grid',
            introKey:
              sectionHeaderPending && presentsIntro
                ? section.introKey
                : undefined,
            sectionHeader: sectionHeaderPending ? (
              <SectionHeaderBlock heading={heading} inline />
            ) : undefined,
            subsectionHeader: subsectionHeaderPending ? (
              <DistrictSubsectionHeader
                district={subsectionHeaderPending}
                inline
              />
            ) : undefined,
            contestElement: contestElement(run.contest),
          });
        } else {
          const runSection: ContestSection = {
            header: sectionHeaderPending ? (
              <SectionHeaderBlock heading={heading} />
            ) : (
              <React.Fragment />
            ),
            subsections: [
              {
                header: subsectionHeaderPending ? (
                  <DistrictSubsectionHeader
                    district={subsectionHeaderPending}
                  />
                ) : (
                  <React.Fragment />
                ),
                elements: run.contests.map(contestElement),
              },
            ],
          };
          // Merge consecutive column runs into a single band so they flow
          // through the page columns together.
          const lastBand = bands.at(-1);
          if (lastBand?.kind === 'columns') {
            lastBand.sections.push(runSection);
          } else {
            bands.push({ kind: 'columns', sections: [runSection] });
          }
        }
        sectionHeaderPending = undefined;
        subsectionHeaderPending = undefined;
      }
    }
  }
  return bands;
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

function sectionContests<Element extends { contest: ContestStruct }>(
  sections: Array<Section<unknown, Element>>
): ContestStruct[] {
  return sections.flatMap((section) =>
    section.subsections.flatMap((subsection) =>
      subsection.elements.map((element) => element.contest)
    )
  );
}

function bandContests(bands: Band[]): ContestStruct[] {
  return bands.flatMap((band) =>
    band.kind === 'columns'
      ? sectionContests(band.sections)
      : [band.contestElement.contest]
  );
}

export interface CaBallotProps extends BaseBallotProps {
  // Set when a page couldn't fit any content and deferred all of its
  // contests to the next page (which has more room when the current page
  // carries the ballot header and instructions). Lets us distinguish "didn't
  // fit this page" from "will never fit any page".
  deferredToNextPage?: boolean;
  // Intro keys of sections whose full introductory header block already
  // rendered on an earlier page, so later pages repeat only the title band.
  renderedSectionHeaders?: string[];
}

async function BallotPageContent(
  props: (CaBallotProps & { dimensions: PixelDimensions }) | undefined,
  scratchpad: RenderScratchpad
): Promise<ContentComponentResult<CaBallotProps>> {
  if (!props) {
    return ok({
      currentPageElement: <BlankPageMessage />,
      nextPageProps: undefined,
    });
  }

  const {
    election,
    ballotStyleId,
    dimensions,
    deferredToNextPage,
    renderedSectionHeaders,
    ...restProps
  } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const contests = getContests({ election, ballotStyle });
  if (contests.length === 0) {
    throw new Error('No contests assigned to this precinct.');
  }

  const renderedSections = new Set(renderedSectionHeaders);
  const bands = buildBands(election, ballotStyle, contests, renderedSections);
  const columnWidthPx = dimensions.width / NUM_PAGE_COLUMNS;

  const pageBandElements: JSX.Element[] = [];
  let remainingHeight = dimensions.height;
  let leftoverContests: ContestStruct[] = [];

  for (const [bandIndex, band] of bands.entries()) {
    const remainingBands = bands.slice(bandIndex + 1);
    if (band.kind === 'grid') {
      const bandElement = (
        <div key={`band-${bandIndex}`}>
          {band.sectionHeader}
          {band.subsectionHeader}
          {band.contestElement.element}
        </div>
      );
      const [measurements] = await scratchpad.measureElements(
        <BackendLanguageContextProvider
          currentLanguageCode={primaryLanguageCode(ballotStyle)}
          uiStringsPackage={election.ballotStrings}
        >
          <div className="wrapper" style={{ width: `${dimensions.width}px` }}>
            {bandElement}
          </div>
        </BackendLanguageContextProvider>,
        '.wrapper'
      );
      if (measurements.height > remainingHeight) {
        // The contest starts on the next page, but if the section's full
        // intro block (not a title-only repeat) fits in the space left on
        // this page, print it here — real Santa Clara County ballots
        // introduce an upcoming section at the bottom of the previous page.
        let noticeSpaceHeight = remainingHeight;
        if (band.sectionHeader && band.introKey) {
          const [headerMeasurements] = await scratchpad.measureElements(
            <BackendLanguageContextProvider
              currentLanguageCode={primaryLanguageCode(ballotStyle)}
              uiStringsPackage={election.ballotStrings}
            >
              <div
                className="wrapper"
                style={{ width: `${dimensions.width}px` }}
              >
                {band.sectionHeader}
              </div>
            </BackendLanguageContextProvider>,
            '.wrapper'
          );
          if (headerMeasurements.height <= remainingHeight) {
            pageBandElements.push(
              <div key={`band-${bandIndex}-section-header`}>
                {band.sectionHeader}
              </div>
            );
            renderedSections.add(band.introKey);
            noticeSpaceHeight -= headerMeasurements.height;
          }
        }
        // When the ballot's very first contest is too large to fit under the
        // front page's header and instructions, explain where it went,
        // centered in the leftover space.
        const isFirstPage =
          deferredToNextPage === undefined &&
          renderedSectionHeaders === undefined;
        if (isFirstPage && bandIndex === 0) {
          pageBandElements.push(
            <div
              key={`band-${bandIndex}-notice`}
              style={{
                height: `${noticeSpaceHeight}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LargeContestNotice contest={band.contestElement.contest} />
            </div>
          );
        }
        leftoverContests = [
          band.contestElement.contest,
          ...bandContests(remainingBands),
        ];
        break;
      }
      pageBandElements.push(bandElement);
      remainingHeight -= measurements.height;
    } else if (
      pageBandElements.length === 0 &&
      sectionContests(band.sections).every(
        (contest) => contest.type === 'yesno'
      )
    ) {
      // When a page starts with ballot measures (rather than measures
      // sharing a page with candidate contests, where they flow in the
      // page columns), lay them out full width to give their descriptions
      // more room.
      interface FullWidthUnit {
        headers: JSX.Element[];
        contestElement: ContestElement;
      }
      const units: FullWidthUnit[] = [];
      for (const section of band.sections) {
        let pendingHeaders: JSX.Element[] = [section.header];
        for (const subsection of section.subsections) {
          pendingHeaders.push(subsection.header);
          for (const element of subsection.elements) {
            units.push({ headers: pendingHeaders, contestElement: element });
            pendingHeaders = [];
          }
        }
      }
      const unitElements = units.map((unit, i) => (
        <div
          key={`band-${bandIndex}-measure-${i}`}
          // Collapse borders between stacked full-width boxes
          style={i > 0 ? { marginTop: '-1px' } : undefined}
        >
          {unit.headers.map((header, j) => (
            <React.Fragment key={j}>{header}</React.Fragment>
          ))}
          {unit.contestElement.element}
        </div>
      ));
      const measurements = await scratchpad.measureElements(
        <BackendLanguageContextProvider
          currentLanguageCode={primaryLanguageCode(ballotStyle)}
          uiStringsPackage={election.ballotStrings}
        >
          {unitElements.map((element, i) => (
            <div
              className="wrapper"
              key={i}
              style={{ width: `${dimensions.width}px` }}
            >
              {element}
            </div>
          ))}
        </BackendLanguageContextProvider>,
        '.wrapper'
      );
      let placedCount = 0;
      for (const [unitIndex, measurement] of measurements.entries()) {
        if (measurement.height > remainingHeight) {
          break;
        }
        pageBandElements.push(unitElements[unitIndex]);
        remainingHeight -= measurement.height;
        placedCount += 1;
      }
      if (placedCount < units.length) {
        leftoverContests = [
          ...units
            .slice(placedCount)
            .map((unit) => unit.contestElement.contest),
          ...bandContests(remainingBands),
        ];
        break;
      }
    } else {
      const measuredSections = await measureSectionElements(
        band.sections,
        election,
        ballotStyle,
        columnWidthPx,
        scratchpad
      );
      const { columns, leftoverSections } = layOutSectionsInColumns({
        sections: measuredSections,
        numColumns: NUM_PAGE_COLUMNS,
        maxColumnHeight: remainingHeight,
      });
      const usedHeight = Math.max(
        ...columns.map((column) =>
          iter(column)
            .map((element) => element.height)
            .sum()
        )
      );
      if (usedHeight === 0) {
        leftoverContests = [
          ...sectionContests(band.sections),
          ...bandContests(remainingBands),
        ];
        break;
      }
      pageBandElements.push(
        <div key={`band-${bandIndex}`} style={{ display: 'flex' }}>
          {columns.map((column, i) => (
            <ContestColumn key={i}>
              {column.map(({ element }) => element)}
            </ContestColumn>
          ))}
        </div>
      );
      remainingHeight -= usedHeight;
      if (leftoverSections.length > 0) {
        leftoverContests = [
          ...sectionContests(leftoverSections),
          ...bandContests(remainingBands),
        ];
        break;
      }
    }
  }

  if (
    pageBandElements.length === 0 &&
    leftoverContests.length === contests.length
  ) {
    // Nothing fit on this page. The first page's content area is shortened
    // by the ballot header and instructions, so a band that doesn't fit here
    // may still fit on a later, full-height page. Defer everything to the
    // next page once before concluding the contest can't fit anywhere.
    if (deferredToNextPage) {
      return err({
        error: 'contestTooLong',
        contest: leftoverContests[0],
      });
    }
    return ok({
      currentPageElement: <BlankPageMessage />,
      nextPageProps: {
        ...restProps,
        deferredToNextPage: true,
        renderedSectionHeaders: [...renderedSections],
        ballotStyleId,
        election: {
          ...election,
          contests: leftoverContests,
        },
      },
    });
  }

  const currentPageElement =
    pageBandElements.length > 0 ? (
      <div>{pageBandElements}</div>
    ) : (
      <BlankPageMessage />
    );

  const leftoverContestIds = new Set(leftoverContests.map((c) => c.id));
  for (const contest of contests) {
    if (!leftoverContestIds.has(contest.id)) {
      renderedSections.add(introKeyOf(sectionKeyOf(contest)));
    }
  }

  const nextPageProps =
    leftoverContests.length > 0
      ? {
          ...restProps,
          deferredToNextPage: false,
          renderedSectionHeaders: [...renderedSections],
          ballotStyleId,
          election: {
            ...election,
            contests: leftoverContests,
          },
        }
      : undefined;

  return ok({
    currentPageElement,
    nextPageProps,
  });
}

export const caBallotTemplate: BallotPageTemplate<CaBallotProps> = {
  stylesComponent: BaseStyles,
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
};
