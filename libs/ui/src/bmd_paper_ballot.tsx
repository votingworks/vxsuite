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
  LanguageCode,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import { getSingleYesNoVote, randomBallotId } from '@votingworks/utils';

import { assert } from '@votingworks/basics';
import { NoWrap } from './text';
import { QrCode } from './qrcode';
import { Font, H4, H5, H6, P } from './typography';
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

const Ballot = styled.div`
  background: #fff;
  color: #000;
  line-height: 1;
  font-family: ${VX_DEFAULT_FONT_FAMILY_DECLARATION};
  font-size: 16px;
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
  largeTopMargin?: boolean;
}
const Header = styled.div<StyledHeaderProps>`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 0.2em solid #000;
  margin-top: ${(p) => (p.largeTopMargin ? '1.75in' : undefined)};

  & h2 {
    margin-bottom: 0;
  }

  & h3 {
    margin-top: 0;
  }

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
const BallotSelections = styled.div`
  columns: 2;
  column-gap: 2em;
`;
const Contest = styled.div`
  border-bottom: 0.01em solid #000;
  padding: 0.5em 0;
  break-inside: avoid;
  page-break-inside: avoid;
`;

const ContestTitle = styled(H6)`
  /* stylelint-disable-next-line font-weight-notation */
  font-weight: normal;
`;

const VoteLine = styled.span`
  display: block;

  &:not(:last-child) {
    margin-bottom: 0.125em;
  }
`;

const SecondaryLanguageText = styled.span`
  font-size: 0.75em;
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

function NewlineText(props: { children: JSX.Element }) {
  const { children } = props;

  return (
    <React.Fragment>
      <br />
      {children}
    </React.Fragment>
  );
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
  primaryBallotLanguage: LanguageCode;
  vote?: CandidateVote;
}

function CandidateContestResult({
  contest,
  election,
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
          {candidate.partyIds && candidate.partyIds.length > 0 && (
            <DualLanguageText
              primaryLanguage={primaryBallotLanguage}
              englishTextWrapper={AdjacentText}
            >
              (
              <CandidatePartyList
                candidate={candidate}
                electionParties={election.parties}
              />
              )
            </DualLanguageText>
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
              englishTextWrapper={NewlineText}
            >
              [{appStrings.labelNumVotesUnused()}{' '}
              <NumberString value={remainingChoices} />]
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
  largeTopMargin?: boolean;
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
  largeTopMargin,
}: BmdPaperBallotProps): JSX.Element {
  console.log('BmdPaperBallot');
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

  return withPrintTheme(
    <LanguageOverride languageCode={primaryBallotLanguage}>
      <Ballot aria-hidden>
        <Header largeTopMargin={largeTopMargin} data-testid="header">
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
          <BallotSelections>
            {contests.map((contest) => (
              <Contest key={contest.id}>
                <ContestTitle>
                  <DualLanguageText
                    primaryLanguage={primaryBallotLanguage}
                    englishTextWrapper={NewlineText}
                  >
                    {electionStrings.contestTitle(contest)}
                  </DualLanguageText>
                </ContestTitle>
                {contest.type === 'candidate' && (
                  <CandidateContestResult
                    contest={contest}
                    election={election}
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
