import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import SeatContest from '../components/SeatContest'
import Text from '../components/Typography'

interface ContestParams {
  id: string
}

interface Props extends RouteComponentProps<ContestParams> {}

const ContestPage = (props: Props) => {
  const { id } = props.match.params
  const { election, updateVote, votes } = useContext(BallotContext)
  const { contests } = election!
  const currentContestIndex = contests.findIndex(x => x.id === id)
  const contest = contests[currentContestIndex]
  const prevContest = contests[currentContestIndex - 1]
  const nextContest = contests[currentContestIndex + 1]
  const vote = contest && votes[contest.id]

  // TODO:
  // - confirm intent when navigating away without selecting a candidate

  return (
    <React.Fragment>
      <Main>
        <MainChild>
          {contest ? (
            contest.type === 'plurality' && (
              <SeatContest
                key={contest.id}
                contest={contest}
                vote={vote}
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
        </MainChild>
      </Main>
      <ButtonBar>
        {nextContest ? (
          <LinkButton
            primary={!!vote}
            to={`/contests/${nextContest && nextContest.id}`}
          >
            Next
          </LinkButton>
        ) : (
          <LinkButton primary={!!vote} to="/review">
            Review
          </LinkButton>
        )}
        {prevContest ? (
          <LinkButton to={`/contests/${prevContest && prevContest.id}`}>
            Previous
          </LinkButton>
        ) : (
          <LinkButton to="/start">Previous</LinkButton>
        )}
        <Text center white>
          {currentContestIndex + 1} of {contests.length}
        </Text>
      </ButtonBar>
      <ButtonBar secondary separatePrimaryButton>
        <LinkButton to="/review">Review</LinkButton>
        <LinkButton to="/help">Help</LinkButton>
        <LinkButton to="/settings">Settings</LinkButton>
      </ButtonBar>
    </React.Fragment>
  )
}

export default ContestPage
