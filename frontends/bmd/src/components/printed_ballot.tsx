import { fromByteArray } from 'base64-js';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';

import { encodeBallot } from '@votingworks/ballot-encoder';
import {
  BallotStyleId,
  BallotType,
  CandidateVote,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
  YesNoVote,
  getBallotStyle,
  getContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  getPrecinctIndexById,
  DisplayTextForYesOrNo,
} from '@votingworks/types';
import {
  assert,
  formatLongDate,
  getSingleYesNoVote,
  getContestVoteInRotatedOrder,
  randomBase64,
} from '@votingworks/utils';

import { findPartyById } from '../utils/find';

import { QrCode } from './qrcode';
import { Prose } from './prose';
import { Text, NoWrap } from './text';
import {
  CandidateContestResultInterface,
  MsEitherNeitherContestResultInterface,
  YesNoContestResultInterface,
} from '../config/types';

const Ballot = styled.div`
  page-break-after: always;
  @media screen {
    display: none;
  }
`;

const SealImage = styled.img`
  max-width: 1in;
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 0.2rem solid #000000;
  & > .seal {
    margin: 0.25rem 0;
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
    margin: 0 1rem;
    max-width: 100%;
  }
`;
const QrCodeContainer = styled.div`
  display: flex;
  flex: 3;
  flex-direction: row;
  align-self: flex-end;
  border: 0.2rem solid #000000;
  border-bottom: 0;
  max-width: 50%;
  padding: 0.25rem;
  & > div:first-child {
    margin-right: 0.25rem;
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
      font-size: 0.8rem;
      & > div {
        margin-bottom: 0.75rem;
      }
      & > div:last-child {
        margin-bottom: 0;
      }
      & strong {
        font-size: 1rem;
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
  column-gap: 2rem;
`;
const Contest = styled.div`
  border-bottom: 0.01rem solid #000000;
  padding: 0.5rem 0;
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

function CandidateContestResult({
  contest,
  election,
  precinctId,
  vote = [],
}: CandidateContestResultInterface): JSX.Element {
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
          {candidate.partyId &&
            `/ ${findPartyById(election.parties, candidate.partyId)?.name}`}
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

function YesNoContestResult({
  contest,
  vote,
}: YesNoContestResultInterface): JSX.Element {
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

function MsEitherNeitherContestResult({
  contest,
  eitherNeitherContestVote,
  pickOneContestVote,
}: MsEitherNeitherContestResultInterface): JSX.Element {
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
}

export function PrintedBallot({
  ballotStyleId,
  electionDefinition,
  isLiveMode,
  precinctId,
  votes,
}: Props): JSX.Element {
  const ballotId = randomBase64(10);
  const {
    election,
    election: { county, date, seal, sealURL: sealUrl, state, title },
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

  return (
    <Ballot aria-hidden>
      <Header>
        {seal ? (
          <div
            className="seal"
            // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
            dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
          />
        ) : sealUrl ? (
          <div id="printedBallotSealContainer" className="seal">
            <SealImage
              src={sealUrl}
              alt=""
              data-testid="printed-ballot-seal-image"
            />
          </div>
        ) : (
          <React.Fragment />
        )}
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
