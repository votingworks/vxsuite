import { fromByteArray } from 'base64-js';
import { DateTime } from 'luxon';
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
  getCandidatePartiesDescription,
  getContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import {
  formatLongDate,
  getSingleYesNoVote,
  randomBallotId,
} from '@votingworks/utils';

import { assert } from '@votingworks/basics';
import { NoWrap } from './text';
import { QrCode } from './qrcode';
import { Font, H4, H5, H6, P } from './typography';
import { VxThemeProvider } from './themes/vx_theme_provider';
import { VX_DEFAULT_FONT_FAMILY_DECLARATION } from './fonts/font_family';

const Ballot = styled.div`
  background: #fff;
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

  & > .seal {
    margin: 0.25em 0;
    width: 1in;
  }

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

function NoSelection({ prefix }: { prefix?: string }): JSX.Element {
  return (
    <VoteLine>
      <Font weight="light">{prefix}[no selection]</Font>
    </VoteLine>
  );
}

interface CandidateContestResultProps {
  contest: CandidateContest;
  election: Election;
  vote?: CandidateVote;
}

function CandidateContestResult({
  contest,
  election,
  /* istanbul ignore next */
  vote = [],
}: CandidateContestResultProps): JSX.Element {
  const remainingChoices = contest.seats - vote.length;

  return vote === undefined || vote.length === 0 ? (
    <NoSelection />
  ) : (
    <React.Fragment>
      {vote.map((candidate) => (
        <VoteLine key={candidate.id}>
          <Font weight="bold">{candidate.name}</Font>{' '}
          {candidate.partyIds &&
            candidate.partyIds.length > 0 &&
            `/ ${getCandidatePartiesDescription(election, candidate)}`}
          {candidate.isWriteIn && '(write-in)'}
        </VoteLine>
      ))}
      {remainingChoices > 0 && (
        <VoteLine>
          <Font weight="light">
            [no selection for {remainingChoices} of {contest.seats} choices]
          </Font>
        </VoteLine>
      )}
    </React.Fragment>
  );
}

interface YesNoContestResultProps {
  contest: YesNoContest;
  vote: OptionalYesNoVote;
}

function YesNoContestResult({
  contest,
  vote,
}: YesNoContestResultProps): JSX.Element {
  const singleVote = getSingleYesNoVote(vote);
  if (!singleVote) return <NoSelection />;
  const option =
    singleVote === contest.yesOption.id ? contest.yesOption : contest.noOption;
  return (
    <VoteLine>
      <Font weight="bold">{option.label}</Font>
    </VoteLine>
  );
}

interface Props {
  ballotStyleId: BallotStyleId;
  electionDefinition: ElectionDefinition;
  generateBallotId?: () => string;
  isLiveMode: boolean;
  precinctId: PrecinctId;
  votes: VotesDict;
  onRendered?: () => void;
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
  onRendered,
  largeTopMargin,
}: Props): JSX.Element {
  const ballotId = generateBallotId();
  const {
    election,
    election: { county, date, seal, state, title },
    electionHash,
  } = electionDefinition;
  const partyPrimaryAdjective = getPartyPrimaryAdjectiveFromBallotStyle({
    ballotStyleId,
    election,
  });
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
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

  return withPrintTheme(
    <Ballot aria-hidden>
      <Header largeTopMargin={largeTopMargin} data-testid="header">
        <div
          className="seal"
          dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
          data-testid="printed-ballot-seal"
        />
        <div className="ballot-header-content">
          <H4>{isLiveMode ? 'Official Ballot' : 'Unofficial TEST Ballot'}</H4>
          <H5>
            {partyPrimaryAdjective} {title}
          </H5>
          <P>
            {formatLongDate(DateTime.fromISO(date))}
            <br />
            {county.name}, {state}
          </P>
        </div>
        <QrCodeContainer>
          <QrCode value={fromByteArray(encodedBallot)} />
          <div>
            <div>
              <div>
                <div>Precinct</div>
                <strong>{precinct.name}</strong>
              </div>
              <div>
                <div>Ballot Style</div>
                <strong>{ballotStyleId}</strong>
              </div>
              <div>
                <div>Ballot ID</div>
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
              <div>
                <ContestTitle>{contest.title}</ContestTitle>
                {contest.type === 'candidate' && (
                  <CandidateContestResult
                    contest={contest}
                    election={election}
                    vote={votes[contest.id] as CandidateVote}
                  />
                )}
                {contest.type === 'yesno' && (
                  <YesNoContestResult
                    contest={contest}
                    vote={votes[contest.id] as YesNoVote}
                  />
                )}
              </div>
            </Contest>
          ))}
        </BallotSelections>
      </Content>
    </Ballot>
  );
}
