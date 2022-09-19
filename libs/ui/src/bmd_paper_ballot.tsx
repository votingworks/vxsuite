import { fromByteArray } from 'base64-js';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
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
  getPrecinctIndexById,
  MsEitherNeitherContest,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import {
  assert,
  formatLongDate,
  getSingleYesNoVote,
  getContestVoteInRotatedOrder,
  randomBallotId,
} from '@votingworks/utils';

import { DisplayTextForYesOrNo } from './globals';
import { NoWrap, Text } from './text';
import { Prose } from './prose';
import { QrCode } from './qrcode';

const Ballot = styled.div`
  background: #ffffff;
  line-height: 1;
  font-family: 'Vx Helvetica Neue', 'Noto Emoji', 'Helvetica Neue', sans-serif;
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

const SealImage = styled.img`
  max-width: 1in;
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 0.2em solid #000000;
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
  border: 0.2em solid #000000;
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
  border-bottom: 0.01em solid #000000;
  padding: 0.5em 0;
  break-inside: avoid;
  page-break-inside: avoid;
`;
const ContestProse = styled(Prose)`
  & > h3 {
    font-size: 0.875em;
    font-weight: 400;
  }
`;
function NoSelection({ prefix }: { prefix?: string }): JSX.Element {
  return (
    <Text italic muted>
      {prefix}[no selection]
    </Text>
  );
}

interface CandidateContestResultProps {
  contest: CandidateContest;
  election: Election;
  precinctId: PrecinctId;
  vote?: CandidateVote;
}

function CandidateContestResult({
  contest,
  election,
  precinctId,
  vote = [],
}: CandidateContestResultProps): JSX.Element {
  const remainingChoices = contest.seats - vote.length;
  const precinctIndex = getPrecinctIndexById({ election, precinctId });
  const sortedVotes = getContestVoteInRotatedOrder({
    contest,
    vote,
    precinctIndex,
  });

  return vote === undefined || vote.length === 0 ? (
    <NoSelection />
  ) : (
    <React.Fragment>
      {sortedVotes.map((candidate) => (
        <Text key={candidate.id} wordBreak>
          <Text bold as="span">
            {candidate.name}
          </Text>{' '}
          {candidate.partyIds &&
            candidate.partyIds.length > 0 &&
            `/ ${getCandidatePartiesDescription(election, candidate)}`}
          {candidate.isWriteIn && '(write-in)'}
        </Text>
      ))}
      {remainingChoices > 0 && (
        <Text italic muted>
          [no selection for {remainingChoices} of {contest.seats} choices]
        </Text>
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
  const yesNo = getSingleYesNoVote(vote);
  return yesNo ? (
    <Text bold wordBreak>
      {DisplayTextForYesOrNo[yesNo]}{' '}
      {!!contest.shortTitle && `on ${contest.shortTitle}`}
    </Text>
  ) : (
    <NoSelection />
  );
}

interface MsEitherNeitherContestResultProps {
  contest: MsEitherNeitherContest;
  eitherNeitherContestVote: OptionalYesNoVote;
  pickOneContestVote: OptionalYesNoVote;
}

function MsEitherNeitherContestResult({
  contest,
  eitherNeitherContestVote,
  pickOneContestVote,
}: MsEitherNeitherContestResultProps): JSX.Element {
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  const pickOneVote = pickOneContestVote?.[0];

  return eitherNeitherVote || pickOneVote ? (
    <React.Fragment>
      {eitherNeitherVote ? (
        <Text bold wordBreak>
          •{' '}
          {eitherNeitherVote === 'yes'
            ? contest.eitherOption.label
            : contest.neitherOption.label}
        </Text>
      ) : (
        <NoSelection prefix="• " />
      )}
      {pickOneVote ? (
        <Text bold wordBreak>
          •{' '}
          {pickOneVote === 'yes'
            ? contest.firstOption.label
            : contest.secondOption.label}
        </Text>
      ) : (
        <NoSelection prefix="• " />
      )}
    </React.Fragment>
  ) : (
    <NoSelection />
  );
}

interface Props {
  ballotStyleId: BallotStyleId;
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  precinctId: PrecinctId;
  votes: VotesDict;
  onRendered?: () => void;
}

/**
 * Renders a paper ballot as printed by a ballot-marking device
 */
export function BmdPaperBallot({
  ballotStyleId,
  electionDefinition,
  isLiveMode,
  precinctId,
  votes,
  onRendered,
}: Props): JSX.Element {
  const ballotId = randomBallotId();
  const {
    election,
    election: { county, date, seal, sealUrl, state, title },
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
    ballotType: BallotType.Standard,
  });

  const [sealLoaded, setSealLoaded] = useState(false);
  useEffect(() => {
    const isRendered = seal || !sealUrl || (sealUrl && sealLoaded);
    if (isRendered && onRendered) {
      onRendered();
    }
  }, [seal, sealUrl, sealLoaded, onRendered]);

  return (
    <Ballot aria-hidden>
      <Header>
        {seal ? (
          <div
            className="seal"
            // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
            dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
            data-testid="printed-ballot-seal"
          />
        ) : sealUrl ? (
          <div
            id="printedBallotSealContainer"
            className="seal"
            data-testid="printed-ballot-seal"
          >
            <SealImage
              src={sealUrl}
              alt=""
              data-testid="printed-ballot-seal-image"
              onLoad={() => setSealLoaded(true)}
            />
          </div>
        ) : null}
        <Prose className="ballot-header-content">
          <h2>{isLiveMode ? 'Official Ballot' : 'Unofficial TEST Ballot'}</h2>
          <h3>
            {partyPrimaryAdjective} {title}
          </h3>
          <p>
            {formatLongDate(DateTime.fromISO(date))}
            <br />
            {county.name}, {state}
          </p>
        </Prose>
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
              <ContestProse compact>
                <h3>{contest.title}</h3>
                {contest.type === 'candidate' && (
                  <CandidateContestResult
                    contest={contest}
                    election={election}
                    precinctId={precinctId}
                    vote={votes[contest.id] as CandidateVote}
                  />
                )}
                {contest.type === 'yesno' && (
                  <YesNoContestResult
                    contest={contest}
                    vote={votes[contest.id] as YesNoVote}
                  />
                )}
                {contest.type === 'ms-either-neither' && (
                  <MsEitherNeitherContestResult
                    contest={contest}
                    eitherNeitherContestVote={
                      votes[contest.eitherNeitherContestId] as YesNoVote
                    }
                    pickOneContestVote={
                      votes[contest.pickOneContestId] as YesNoVote
                    }
                  />
                )}
              </ContestProse>
            </Contest>
          ))}
        </BallotSelections>
      </Content>
    </Ballot>
  );
}
