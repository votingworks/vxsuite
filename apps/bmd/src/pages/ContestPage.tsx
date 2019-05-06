import React, { useContext } from 'react'
import { Redirect, RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import { CandidateVote, OptionalYesNoVote } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import ButtonBar from '../components/ButtonBar'
import CandidateContest from '../components/CandidateContest'
import LinkButton from '../components/LinkButton'
import Text from '../components/Text'
import YesNoContest from '../components/YesNoContest'

const Progress = styled(Text)`
  flex: 2;
`

interface ContestParams {
  contestNumber: string
}

interface Props extends RouteComponentProps<ContestParams> {}

const ContestPage = (props: Props) => {
  const { contestNumber } = props.match.params
  const { election, updateVote, votes, contests, resetBallot } = useContext(
    BallotContext
  )

  const { bmdConfig } = election!
  const { showHelpPage, showSettingsPage } = bmdConfig!
  const currentContestIndex = parseInt(contestNumber, 10)
  const contest = contests[currentContestIndex]

  if (!contest) {
    resetBallot()
    return <Redirect to="/" />
  }

  const prevContestIndex = currentContestIndex - 1
  const prevContest = contests[prevContestIndex]

  const nextContestIndex = currentContestIndex + 1
  const nextContest = contests[nextContestIndex]
  const vote = votes[contest.id]
  let isVoteComplete = !!vote
  if (contest.type === 'candidate') {
    isVoteComplete = contest.seats === ((vote as CandidateVote) || []).length
  }
  const isReviewMode = window.location.hash === '#review'
  // TODO:
  // - confirm intent when navigating away without selecting a candidate

  return (
    <React.Fragment>
      {contest.type === 'candidate' && (
        <CandidateContest
          key={contest.id}
          contest={contest}
          vote={(vote || []) as CandidateVote}
          updateVote={updateVote}
        />
      )}
      {contest.type === 'yesno' && (
        <YesNoContest
          key={contest.id}
          contest={contest}
          vote={vote as OptionalYesNoVote}
          updateVote={updateVote}
        />
      )}
      <ButtonBar>
        {isReviewMode ? (
          <React.Fragment>
            <LinkButton
              primary={isVoteComplete}
              to={`/review#contest-${contest.id}`}
              id="next"
            >
              Review Ballot
            </LinkButton>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <LinkButton
              id="next"
              primary={isVoteComplete}
              to={nextContest ? `/contests/${nextContestIndex}` : '/pre-review'}
            >
              Next
            </LinkButton>
            <LinkButton
              id="previous"
              to={prevContest ? `/contests/${prevContestIndex}` : '/start'}
            >
              Back
            </LinkButton>
            <Progress center white>
              {currentContestIndex + 1} of {contests.length}
            </Progress>
          </React.Fragment>
        )}
      </ButtonBar>
      <ButtonBar
        secondary
        separatePrimaryButton
        centerOnlyChild={!showHelpPage && !showSettingsPage && false}
      >
        <div />
        {showHelpPage && <LinkButton to="/help">Help</LinkButton>}
        {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
      </ButtonBar>
    </React.Fragment>
  )
}

export default ContestPage
