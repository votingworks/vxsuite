import React from 'react'
import styled from 'styled-components'
import {
  encodeBallot,
  BallotType,
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  VotesDict,
  CandidateContest,
  YesNoContest,
  Contests,
  Parties,
  Election,
} from '@votingworks/ballot-encoder'

import { fromByteArray } from 'base64-js'
import * as GLOBALS from '../config/globals'

import { randomBase64 } from '../utils/random'
import { findPartyById } from '../utils/find'
import {
  getBallotStyle,
  getContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
} from '../utils/election'

import QRCode from './QRCode'
import Prose from './Prose'
import Text, { NoWrap } from './Text'

const Ballot = styled.div`
  page-break-after: always;
  @media screen {
    display: none;
  }
`

const SealImage = styled.img`
  max-width: 1in;
`

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
`
const QRCodeContainer = styled.div`
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
`
const Content = styled.div`
  flex: 1;
`
const BallotSelections = styled.div`
  columns: 2;
  column-gap: 2rem;
`
const Contest = styled.div`
  border-bottom: 0.01rem solid #000000;
  padding: 0.5rem 0;
  break-inside: avoid;
  page-break-inside: avoid;
`
const ContestProse = styled(Prose)`
  & > h3 {
    font-size: 0.875em;
    font-weight: 400;
  }
`
const NoSelection = () => (
  <Text italic muted>
    [no selection]
  </Text>
)

const CandidateContestResult = ({
  contest,
  parties,
  vote = [],
}: {
  contest: CandidateContest
  parties: Parties
  vote: CandidateVote
}) => {
  const remainingChoices = contest.seats - vote.length
  return vote === undefined || vote.length === 0 ? (
    <NoSelection />
  ) : (
    <React.Fragment>
      {vote.map((candidate) => (
        <Text bold key={candidate.id} wordBreak>
          <strong>{candidate.name}</strong>{' '}
          {candidate.partyId &&
            `/ ${findPartyById(parties, candidate.partyId)!.name}`}
          {candidate.isWriteIn && '(write-in)'}
        </Text>
      ))}
      {!!remainingChoices && (
        <Text italic muted>
          [no selection for {remainingChoices} of {contest.seats} choices]
        </Text>
      )}
    </React.Fragment>
  )
}

const YesNoContestResult = (props: {
  contest: YesNoContest
  vote: OptionalYesNoVote
}) =>
  props.vote ? (
    <Text bold wordBreak>
      <strong>
        {GLOBALS.YES_NO_VOTES[props.vote]}{' '}
        {!!props.contest.shortTitle && `on ${props.contest.shortTitle}`}
      </strong>
    </Text>
  ) : (
    <NoSelection />
  )

interface Props {
  ballotStyleId: string
  election: Election
  isLiveMode: boolean
  precinctId: string
  votes: VotesDict
}

const PrintBallot = ({
  ballotStyleId,
  election,
  isLiveMode,
  precinctId,
  votes,
}: Props) => {
  const ballotId = randomBase64(10)
  const { county, date, seal, sealURL, state, parties, title } = election
  const partyPrimaryAdjective = getPartyPrimaryAdjectiveFromBallotStyle({
    ballotStyleId,
    election,
  })
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const contests = getContests({ ballotStyle, election })
  const precinct = getPrecinctById({ election, precinctId })!
  const encodedBallot = encodeBallot({
    election,
    precinct,
    ballotId: '',
    ballotStyle,
    votes,
    isTestBallot: !isLiveMode,
    ballotType: BallotType.Standard,
  })

  return (
    <Ballot aria-hidden>
      <Header>
        {seal ? (
          <div
            className="seal"
            // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
            dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
          />
        ) : sealURL ? (
          <div className="seal">
            <SealImage src={sealURL} alt="" />
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
            {date}
            <br />
            {county.name}, {state}
          </p>
        </Prose>
        <QRCodeContainer>
          <QRCode value={fromByteArray(encodedBallot)} />
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
        </QRCodeContainer>
      </Header>
      <Content>
        <BallotSelections>
          {(contests as Contests).map((contest) => (
            <Contest key={contest.id}>
              <ContestProse compact>
                <h3>{contest.title}</h3>
                {contest.type === 'candidate' && (
                  <CandidateContestResult
                    contest={contest}
                    parties={parties}
                    vote={votes[contest.id] as CandidateVote}
                  />
                )}
                {contest.type === 'yesno' && (
                  <YesNoContestResult
                    contest={contest}
                    vote={votes[contest.id] as YesNoVote}
                  />
                )}
              </ContestProse>
            </Contest>
          ))}
        </BallotSelections>
      </Content>
    </Ballot>
  )
}

export default PrintBallot
