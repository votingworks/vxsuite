import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import BallotContext from '../contexts/ballotContext'

import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main from '../components/Main'
import SingleCandidateContest from '../components/SingleCandidateContest'

interface ContestParams {
  id: string
}

interface Props extends RouteComponentProps<ContestParams> {}

const ContestPage = (props: Props) => {
  const { id } = props.match.params
  const { contests, updateVote, votes } = useContext(BallotContext)
  const currentContestIndex = contests.findIndex(x => x.id === id)
  const contest = contests[currentContestIndex]
  const prevContest = contests[currentContestIndex - 1]
  const nextContest = contests[currentContestIndex + 1]

  return (
    <React.Fragment>
      <Main>
        {contest ? (
          contest.type === 'plurality' && (
            <SingleCandidateContest
              contest={contest}
              vote={votes[contest.id]}
              updateVote={updateVote}
            />
          )
        ) : (
          <React.Fragment>
            <h1>Error</h1>
            <p>
              no contest exists for id <code>"{id}"</code>
            </p>
            <LinkButton to="/">Start Over</LinkButton>
          </React.Fragment>
        )}
      </Main>
      <ButtonBar>
        {nextContest ? (
          <LinkButton
            disabled={!nextContest}
            to={`/contests/${nextContest && nextContest.id}`}
          >
            Next
          </LinkButton>
        ) : (
          <LinkButton to="/summary">View Ballot</LinkButton>
        )}
        <LinkButton
          disabled={!prevContest}
          to={`/contests/${prevContest && prevContest.id}`}
        >
          Previous
        </LinkButton>
        <LinkButton to="/summary">View Summary</LinkButton>
      </ButtonBar>
    </React.Fragment>
  )
}

export default ContestPage
