import { fromByteArray } from 'base64-js';
import React from 'react';
import styled from 'styled-components';

import { encodeBallot } from '@votingworks/ballot-encoder';
import {
  BallotStyleId,
  BallotType,
  CandidateContest,
  CandidateVote,
  Election,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  getPrecinctById,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import { getSingleYesNoVote, randomBallotId } from '@votingworks/utils';

import { assert, err, ok, Result } from '@votingworks/basics';
import { QrCode } from './qrcode';
import { Font, H4, H5, P } from './typography';
import { VxThemeProvider } from './themes/vx_theme_provider';
import { VX_DEFAULT_FONT_FAMILY_DECLARATION } from './fonts/font_family';
import { Seal } from './seal';
import {
  electionStrings,
  PrimaryElectionTitlePrefix,
  appStrings,
  LanguageOverride,
  CandidatePartyList,
  InEnglish,
  NumberString,
} from './ui_strings';
import { CAPITAL_HEIGHT_TO_FULL_FONT_HEIGHT_RATIO } from './themes/make_theme';

export type MachineType = 'mark' | 'markScan';

/**
 * Maximum number of contests we can reasonably fit on a single page of a BMD
 * paper ballot without sacrificing too much readability.
 *
 * TODO(kofi): Enforce this limit in VxDesign.
 */
export const MAX_BMD_PAPER_BALLOT_CONTESTS = 135;

/**
 * Max margin required to keep the ballot header visible when the page is
 * partially covered by the VSAP infeed hood.
 */
export const MAX_MARK_SCAN_TOP_MARGIN = '1.75in';

/**
 * Min margin required to keep the first row of contests visible when the page
 * is partially covered by the VSAP infeed hood.
 */
export const MIN_MARK_SCAN_TOP_MARGIN = '0.5625in';

export interface Layout {
  /**
   * Optional font size override. Default font size is set to `10pt`, which is
   * the minimum size that satisfies VVSG 2.0 print size requirements. This
   * should only be used for high-contest-count ballots.
   */
  fontSizePt?: number;

  /**
   * Whether or not to hide candidate party names in candidate contests to save
   * space in denser layouts.
   */
  hideParties: boolean;

  /** Maximum number of contest rows per column to print on the ballot. */
  maxRows: number;

  /**
   * Minimum number of contests required for this layout to be used in printing
   * a ballot.
   */
  minContests: number;

  /**
   * Additional top margin to apply to the print to ensure all important content
   * is visible - necessary for MarkScan, where printouts are partially covered
   * by the hood of the paper tray when being reviewed by the voter.
   */
  topMargin?: typeof MAX_MARK_SCAN_TOP_MARGIN | typeof MIN_MARK_SCAN_TOP_MARGIN;
}

/**
 * Layout config for each {@link MachineType} at various contest-count
 * thresholds.
 *
 * NOTE: Should be defined in order of unique, increasing
 * {@link Layout.minContests}.
 */
export const ORDERED_BMD_BALLOT_LAYOUTS: Readonly<
  Record<MachineType, readonly Layout[]>
> = {
  markScan: [
    { minContests: 0, maxRows: 7, hideParties: false, topMargin: '1.75in' },
    { minContests: 25, maxRows: 8, hideParties: true, topMargin: '0.5625in' },
    {
      minContests: 31,
      fontSizePt: 9,
      maxRows: 10,
      hideParties: true,
      topMargin: '0.5625in',
    },
    {
      minContests: 46,
      fontSizePt: 8,
      maxRows: 13,
      hideParties: true,
      topMargin: '0.5625in',
    },
    {
      minContests: 51,
      fontSizePt: 7,
      maxRows: 12,
      hideParties: true,
      topMargin: '0.5625in',
    },
    {
      minContests: 66,
      fontSizePt: 6,
      maxRows: 16,
      hideParties: true,
      topMargin: '0.5625in',
    },
    {
      minContests: 86,
      fontSizePt: 5,
      maxRows: 19,
      hideParties: true,
      topMargin: '0.5625in',
    },
  ],
  mark: [
    { minContests: 0, maxRows: 11, hideParties: false },
    { minContests: 14, maxRows: 10, hideParties: false },
    { minContests: 25, maxRows: 8, hideParties: true },
    { minContests: 31, maxRows: 9, hideParties: true, fontSizePt: 9 },
    { minContests: 46, maxRows: 10, hideParties: true, fontSizePt: 8 },
    { minContests: 56, maxRows: 11, hideParties: true, fontSizePt: 7 },
    { minContests: 66, maxRows: 15, hideParties: true, fontSizePt: 6 },
    { minContests: 86, maxRows: 20, hideParties: true, fontSizePt: 5 },
  ],
};

export class NoLayoutOptionError extends Error {
  constructor(contestCount: number, offset: number, machineType: MachineType) {
    const message = `No layout option for machineType=${machineType}, contestCount=${contestCount}, offset=${offset}`;
    super(message);
  }
}

/**
 * Gets a ballot layout to render a BmdPaperBallot with.
 * @param machineType The BMD {@link MachineType}
 * @param ballotStyleId The {@link BallotStyleId} that is being rendered.
 * @param electionDefinition
 * @param densityOffset An integer specifying how many "steps" to increase density by selecting a denser layout. See {@link ORDERED_BMD_BALLOT_LAYOUTS}.
 * @returns A {@link Layout} selected based on the minimum number of contests, or a {@link NoLayoutOptionError} indicating the densityOffset was out of bounds.
 */
export function getLayout(
  machineType: MachineType,
  ballotStyleId: BallotStyleId,
  electionDefinition: ElectionDefinition,
  densityOffset: number = 0
): Result<Layout, NoLayoutOptionError> {
  const { election } = electionDefinition;
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  const contests = getContests({ ballotStyle, election });

  const possibleLayoutsDescending = [
    ...ORDERED_BMD_BALLOT_LAYOUTS[machineType],
  ].reverse();

  // Ballot layout for the typical use case. This layout should accommodate most elections.
  const i = possibleLayoutsDescending.findIndex(
    (l) => contests.length >= l.minContests
  );

  // Passed `densityOffset` param indicates we should try to choose a more dense layout, possibly
  // because a previous render attempt exceeded 1 page.
  if (i - densityOffset < 0) {
    return err(
      new NoLayoutOptionError(contests.length, densityOffset, machineType)
    );
  }

  const finalLayoutIndex = Math.max(i - densityOffset, 0);
  return ok(possibleLayoutsDescending[finalLayoutIndex]);
}

export type BmdBallotSheetSize = 'letter' | 'bmd150';

interface BallotProps {
  sheetSize?: BmdBallotSheetSize;
}

//
// [VVSG 2.0] 7.1-I – Text size (paper)
// The voting system must be capable of printing paper ballots and other paper
// records with a font size of at least 3.5 mm (10 points).
//
// [VVSG 2.0] 7.1-G – Text size (electronic display)
// A voting system’s electronic display must be capable of showing all
// information in a range of text sizes that voters can select from, with a
// default text size at least 4.8 mm(based on the height of the uppercase I)
//
// Based on the the above, we're interpreting the spec as requiring the capital
// letter height of printed text to be at least `10pt` (as opposed to the full
// font size being `10pt`), so we apply a scaling ratio based on the estimated
// font-size-to-cap-height ratio of our official font, in order to meet that
// requirement.
//
const CAPITAL_LETTER_SIZE_PTS = 10;
function getVvsgFontSizePts(targetFontSizePts: number) {
  return targetFontSizePts * CAPITAL_HEIGHT_TO_FULL_FONT_HEIGHT_RATIO;
}

const DEFAULT_FONT_SIZE_PTS = getVvsgFontSizePts(CAPITAL_LETTER_SIZE_PTS);

const Ballot = styled.div<BallotProps>`
  background: #fff;
  color: #000;
  line-height: 1;
  font-family: ${VX_DEFAULT_FONT_FAMILY_DECLARATION};
  font-size: ${DEFAULT_FONT_SIZE_PTS}pt !important;
  page-break-after: always;

  @page {
    margin: 0.375in;
    size: ${(props) => {
      switch (props.sheetSize) {
        /* istanbul ignore next - hardware specs still in flux */
        case 'bmd150':
          // Width of exactly 8in results in 1-3 dots of overflow. The overflowing dots print on a line of
          // their own, followed by a mostly blank line. This causes stripes in the printed page.
          /* istanbul ignore next - hardware specs still in flux */
          return '7.975in 13.25in';
        case 'letter':
        default:
          return 'letter portrait';
      }
    }};
  }
`;

interface StyledHeaderProps {
  layout: Layout;
}
const Header = styled.div<StyledHeaderProps>`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 0.2em solid #000;
  margin-top: ${(p) => p.layout.topMargin};

  & > .ballot-header-content {
    flex: 4;
    margin: 0 1em;
    max-width: 100%;
  }
`;
const QrCodeContainer = styled.div`
  display: flex;
  flex: 3;
  flex-direction: row;
  align-self: flex-end;
  border: 0.2em solid #000;
  border-bottom: 0;
  max-width: 50%;
  padding: 0.25em;

  /*
    Assumption here is that this metadata doesn't have to meet the requirements
    for user-facing print text. The layout for this element was initially
    created with a smaller font size as reference and gets thrown off with the
    updated font size (see FONT_SIZE_PTS above), so locking it to 10pt for now.
  */
  font-size: 10pt !important;

  & > div:last-child {
    margin-left: 0.25em;
    width: 1.1in;
  }

  & > div:first-child {
    display: flex;
    flex: 1;

    & > div {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-self: stretch;
      font-size: 0.8em;

      & > div {
        margin-bottom: 0.9375em;
      }

      & > div:last-child {
        margin-bottom: 0;
      }

      & strong {
        font-size: 1.25em;
        word-break: break-word;
      }
    }
  }
`;
const Content = styled.div<{ layout: Layout }>`
  flex: 1;
  font-size: ${(p) =>
    p.layout.fontSizePt
      ? getVvsgFontSizePts(p.layout.fontSizePt)
      : DEFAULT_FONT_SIZE_PTS}pt !important;
`;
const BallotSelections = styled.div<{ numColumns: number }>`
  columns: ${(p) => p.numColumns};
  column-gap: 1em;
`;
const Contest = styled.div`
  border-bottom: 0.01em solid #000;
  padding: 0.25em 0;
  break-inside: avoid;
  page-break-inside: avoid;
`;

const ContestTitle = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em;
  margin: 0;
  margin-bottom: 0.25em;
`;

const VoteLine = styled.span`
  display: block;

  &:not(:last-child) {
    margin-bottom: 0.1em;
  }
`;

const SecondaryLanguageText = styled.span`
  font-size: 0.6em;
`;

const InlineBlockSpan = styled.span`
  display: inline-block;
`;

function DualLanguageText(props: {
  children: React.ReactNode;
  primaryLanguage: string;
  englishTextWrapper: React.JSXElementConstructor<{
    children: React.ReactElement;
  }>;
}) {
  const {
    children,
    primaryLanguage,
    englishTextWrapper: EnglishTextWrapper,
  } = props;

  if (primaryLanguage === 'en') {
    return children;
  }

  return (
    <React.Fragment>
      {children}
      <EnglishTextWrapper>
        <SecondaryLanguageText>
          <InEnglish>{children}</InEnglish>
        </SecondaryLanguageText>
      </EnglishTextWrapper>
    </React.Fragment>
  );
}

function AdjacentText(props: { children: JSX.Element }) {
  const { children } = props;

  return <React.Fragment> {children}</React.Fragment>;
}

function AdjacentTextWithSeparator(props: { children: JSX.Element }) {
  const { children } = props;

  return <React.Fragment> | {children}</React.Fragment>;
}

function ParenthesizedText(props: { children: JSX.Element }) {
  const { children } = props;

  return <React.Fragment> ({children})</React.Fragment>;
}

function NoSelection(props: { primaryBallotLanguage: string }): JSX.Element {
  const { primaryBallotLanguage } = props;

  return (
    <VoteLine>
      <Font weight="light">
        <DualLanguageText
          primaryLanguage={primaryBallotLanguage}
          englishTextWrapper={AdjacentTextWithSeparator}
        >
          [{appStrings.noteBallotContestNoSelection()}]
        </DualLanguageText>
      </Font>
    </VoteLine>
  );
}

interface CandidateContestResultProps {
  contest: CandidateContest;
  election: Election;
  layout: Layout;
  primaryBallotLanguage: string;
  vote?: CandidateVote;
}

function CandidateContestResult({
  contest,
  election,
  layout,
  primaryBallotLanguage,
  vote = [],
}: CandidateContestResultProps): JSX.Element {
  const remainingChoices = contest.seats - vote.length;

  return vote === undefined || vote.length === 0 ? (
    <NoSelection primaryBallotLanguage={primaryBallotLanguage} />
  ) : (
    <React.Fragment>
      {vote.map((candidate) => (
        <VoteLine key={candidate.id}>
          <Font weight="bold">
            {candidate.isWriteIn ? (
              candidate.name
            ) : (
              <InEnglish>{electionStrings.candidateName(candidate)}</InEnglish>
            )}
          </Font>{' '}
          {layout.hideParties
            ? undefined
            : candidate.partyIds && (
                <CandidatePartyList
                  candidate={candidate}
                  electionParties={election.parties}
                />
              )}
          {candidate.isWriteIn && (
            <DualLanguageText
              primaryLanguage={primaryBallotLanguage}
              englishTextWrapper={AdjacentText}
            >
              {appStrings.labelWriteInParenthesized()}
            </DualLanguageText>
          )}
        </VoteLine>
      ))}
      {remainingChoices > 0 && (
        <VoteLine>
          <Font weight="light">
            <DualLanguageText
              primaryLanguage={primaryBallotLanguage}
              englishTextWrapper={AdjacentText}
            >
              <InlineBlockSpan>
                [{appStrings.labelNumVotesUnused()}{' '}
                <NumberString value={remainingChoices} />]
              </InlineBlockSpan>
            </DualLanguageText>
          </Font>
        </VoteLine>
      )}
    </React.Fragment>
  );
}

interface YesNoContestResultProps {
  contest: YesNoContest;
  primaryBallotLanguage: string;
  vote: OptionalYesNoVote;
}

function YesNoContestResult({
  contest,
  primaryBallotLanguage,
  vote = [],
}: YesNoContestResultProps): JSX.Element {
  const singleVote = getSingleYesNoVote(vote);
  if (!singleVote) {
    return <NoSelection primaryBallotLanguage={primaryBallotLanguage} />;
  }
  const option =
    singleVote === contest.yesOption.id ? contest.yesOption : contest.noOption;
  return (
    <VoteLine>
      <Font weight="bold">
        <DualLanguageText
          primaryLanguage={primaryBallotLanguage}
          englishTextWrapper={ParenthesizedText}
        >
          {electionStrings.contestOptionLabel(option)}
        </DualLanguageText>
      </Font>
    </VoteLine>
  );
}

export interface BmdPaperBallotProps {
  ballotStyleId: BallotStyleId;
  binarize?: boolean;
  electionDefinition: ElectionDefinition;
  generateBallotId?: () => string;
  isLiveMode: boolean;
  precinctId: PrecinctId;
  votes: VotesDict;
  onRendered?: () => void;
  sheetSize?: BmdBallotSheetSize;
  layout?: Layout;
  machineType: MachineType;
}

/**
 * Provides a theme context when rendering for print and overrides any parent
 * themes appropriately when rendering for screen.
 */
function withPrintTheme(ballot: JSX.Element): JSX.Element {
  return (
    <VxThemeProvider colorMode="contrastHighLight" sizeMode="touchSmall">
      {ballot}
    </VxThemeProvider>
  );
}

/**
 * Renders a paper ballot as printed by a ballot-marking device
 */
export function BmdPaperBallot({
  ballotStyleId,
  binarize,
  electionDefinition,
  generateBallotId = randomBallotId,
  isLiveMode,
  precinctId,
  votes,
  sheetSize = 'letter',
  layout,
  machineType,
}: BmdPaperBallotProps): JSX.Element {
  const ballotId = generateBallotId();
  const {
    election,
    election: { county, seal },
    ballotHash,
  } = electionDefinition;
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  const primaryBallotLanguage = ballotStyle.languages?.[0] || 'en';
  const contests = getContests({ ballotStyle, election });
  const precinct = getPrecinctById({ election, precinctId });
  assert(precinct);
  const encodedBallot = encodeBallot(election, {
    ballotHash,
    precinctId,
    ballotStyleId,
    votes,
    isTestMode: !isLiveMode,
    ballotType: BallotType.Precinct,
  });

  const ballotLayout =
    layout ??
    getLayout(machineType, ballotStyleId, electionDefinition).unsafeUnwrap();

  const numColumns = Math.ceil(contests.length / ballotLayout.maxRows);

  return withPrintTheme(
    <LanguageOverride languageCode={primaryBallotLanguage}>
      <Ballot sheetSize={sheetSize} aria-hidden>
        <Header layout={ballotLayout} data-testid="header">
          <Seal
            binarize={binarize}
            seal={seal}
            maxWidth="1in"
            style={{ margin: '0.25em 0' }}
          />
          <div className="ballot-header-content">
            <H4>
              <DualLanguageText
                primaryLanguage={primaryBallotLanguage}
                englishTextWrapper={AdjacentTextWithSeparator}
              >
                {isLiveMode
                  ? appStrings.titleOfficialBallot()
                  : appStrings.titleUnofficialTestBallot()}
              </DualLanguageText>
            </H4>
            <H5>
              <DualLanguageText
                primaryLanguage={primaryBallotLanguage}
                englishTextWrapper={AdjacentTextWithSeparator}
              >
                <PrimaryElectionTitlePrefix
                  ballotStyleId={ballotStyleId}
                  election={election}
                />
                {electionStrings.electionTitle(election)}
              </DualLanguageText>
            </H5>
            <P>
              <DualLanguageText
                primaryLanguage={primaryBallotLanguage}
                englishTextWrapper={AdjacentTextWithSeparator}
              >
                {electionStrings.electionDate(election)}
              </DualLanguageText>
              <br />
              {electionStrings.countyName(county)},{' '}
              {electionStrings.stateName(election)}
            </P>
          </div>
          <QrCodeContainer>
            <div>
              <div>
                <div>
                  <div>
                    <InEnglish>{appStrings.titlePrecinct()}</InEnglish>
                  </div>
                  <strong>
                    <InEnglish>
                      {electionStrings.precinctName(precinct)}
                    </InEnglish>
                  </strong>
                </div>
                <div>
                  <div>
                    <InEnglish>{appStrings.titleBallotStyle()}</InEnglish>
                  </div>
                  <strong>{ballotStyleId}</strong>
                </div>
                <div>
                  <div>
                    <InEnglish>{appStrings.titleBallotId()}</InEnglish>
                  </div>
                  <strong style={{ whiteSpace: 'nowrap' }}>{ballotId}</strong>
                </div>
              </div>
            </div>
            <QrCode value={fromByteArray(encodedBallot)} />
          </QrCodeContainer>
        </Header>
        <Content layout={ballotLayout}>
          <BallotSelections numColumns={numColumns}>
            {contests.map((contest) => (
              <Contest key={contest.id}>
                <ContestTitle>
                  <DualLanguageText
                    primaryLanguage={primaryBallotLanguage}
                    englishTextWrapper={AdjacentText}
                  >
                    <InlineBlockSpan>
                      {electionStrings.contestTitle(contest)}
                    </InlineBlockSpan>
                  </DualLanguageText>
                </ContestTitle>
                {contest.type === 'candidate' && (
                  <CandidateContestResult
                    contest={contest}
                    election={election}
                    layout={ballotLayout}
                    primaryBallotLanguage={primaryBallotLanguage}
                    vote={votes[contest.id] as CandidateVote}
                  />
                )}
                {contest.type === 'yesno' && (
                  <YesNoContestResult
                    contest={contest}
                    primaryBallotLanguage={primaryBallotLanguage}
                    vote={votes[contest.id] as YesNoVote}
                  />
                )}
              </Contest>
            ))}
          </BallotSelections>
        </Content>
      </Ballot>
    </LanguageOverride>
  );
}
