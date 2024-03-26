import { fromByteArray } from 'base64-js';
import React, { useEffect } from 'react';
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
  LanguageCode,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import { getSingleYesNoVote, randomBallotId } from '@votingworks/utils';

import { assert, find } from '@votingworks/basics';
import { NoWrap } from './text';
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

export type MachineType = 'mark' | 'markScan';

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

interface Layout {
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
    { minContests: 0, maxRows: 10, hideParties: false, topMargin: '1.75in' },
    { minContests: 21, maxRows: 10, hideParties: true, topMargin: '0.5625in' },
    { minContests: 31, maxRows: 9, hideParties: true, topMargin: '0.5625in' },
    { minContests: 37, maxRows: 8, hideParties: true, topMargin: '0.5625in' },
    { minContests: 49, maxRows: 7, hideParties: true, topMargin: '0.5625in' },
  ],
  mark: [
    { minContests: 0, maxRows: 12, hideParties: false },
    { minContests: 25, maxRows: 11, hideParties: true },
    { minContests: 37, maxRows: 11, hideParties: true },
    { minContests: 45, maxRows: 10, hideParties: true },
    { minContests: 55, maxRows: 8, hideParties: true },
  ],
};

const Ballot = styled.div<{ layout: Layout }>`
  background: #fff;
  color: #000;
  line-height: 1;
  font-family: ${VX_DEFAULT_FONT_FAMILY_DECLARATION};
  font-size: 10pt !important;
  page-break-after: always;

  @media screen {
    display: none;
  }

  @page {
    margin: 0.375in;
    size: letter portrait;
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

  & > div:first-child {
    margin-right: 0.25em;
    width: 1.1in;
  }

  & > div:last-child {
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
const Content = styled.div`
  flex: 1;
`;
const BallotSelections = styled.div<{ numColumns: number }>`
  columns: ${(p) => p.numColumns};
  column-gap: 1em;
`;
const Contest = styled.div`
  border-bottom: 0.01em solid #000;
  padding: 0.5em 0;
  break-inside: avoid;
  page-break-inside: avoid;
`;

const ContestTitle = styled.div`
  font-size: 1.125em;
  /* stylelint-disable-next-line font-weight-notation */
  font-weight: normal;
  margin: 0;
  margin-bottom: 0.25em;
`;

const VoteLine = styled.span`
  display: block;

  &:not(:last-child) {
    margin-bottom: 0.125em;
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
  primaryLanguage: LanguageCode;
  englishTextWrapper: React.JSXElementConstructor<{
    children: React.ReactElement;
  }>;
}) {
  const {
    children,
    primaryLanguage,
    englishTextWrapper: EnglishTextWrapper,
  } = props;

  if (primaryLanguage === LanguageCode.ENGLISH) {
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

function NoSelection(props: {
  primaryBallotLanguage: LanguageCode;
}): JSX.Element {
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
  primaryBallotLanguage: LanguageCode;
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
  primaryBallotLanguage: LanguageCode;
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
  electionDefinition: ElectionDefinition;
  generateBallotId?: () => string;
  isLiveMode: boolean;
  precinctId: PrecinctId;
  votes: VotesDict;
  onRendered?: () => void;
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
  electionDefinition,
  generateBallotId = randomBallotId,
  isLiveMode,
  precinctId,
  votes,
  onRendered,
  machineType,
}: BmdPaperBallotProps): JSX.Element {
  const ballotId = generateBallotId();
  const {
    election,
    election: { county, seal },
    electionHash,
  } = electionDefinition;
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  const primaryBallotLanguage =
    ballotStyle.languages?.[0] || LanguageCode.ENGLISH;
  const contests = getContests({ ballotStyle, election });
  const precinct = getPrecinctById({ election, precinctId });
  assert(precinct);
  const encodedBallot = encodeBallot(election, {
    electionHash,
    precinctId,
    ballotStyleId,
    votes,
    isTestMode: !isLiveMode,
    ballotType: BallotType.Precinct,
  });

  useEffect(() => {
    if (onRendered) {
      onRendered();
    }
  }, [onRendered]);

  const layout = find(
    [...ORDERED_BMD_BALLOT_LAYOUTS[machineType]].reverse(),
    (l) => contests.length >= l.minContests
  );

  const numColumns = Math.ceil(contests.length / layout.maxRows);

  return withPrintTheme(
    <LanguageOverride languageCode={primaryBallotLanguage}>
      <Ballot aria-hidden layout={layout}>
        <Header layout={layout} data-testid="header">
          <Seal seal={seal} maxWidth="1in" style={{ margin: '0.25em 0' }} />
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
            <QrCode value={fromByteArray(encodedBallot)} />
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
                  <NoWrap as="strong">{ballotId}</NoWrap>
                </div>
              </div>
            </div>
          </QrCodeContainer>
        </Header>
        <Content>
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
                    layout={layout}
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
