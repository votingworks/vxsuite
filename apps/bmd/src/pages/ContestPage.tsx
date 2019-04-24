import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import { CandidateVote, OptionalYesNoVote } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import CandidateContest from '../components/CandidateContest'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import YesNoContest from '../components/YesNoContest'

const Progress = styled(Text)`
  flex: 2;
`

interface ContestParams {
  id: string
}

interface Props extends RouteComponentProps<ContestParams> {}

const ContestPage = (props: Props) => {
  const { id } = props.match.params
  const { election, resetBallot, updateVote, votes } = useContext(BallotContext)
  const { contests, bmdConfig } = election!
  const { showHelpPage, showSettingsPage } = bmdConfig!
  const currentContestIndex = contests.findIndex(x => x.id === id)
  const contest = contests[currentContestIndex]
  if (!contest) {
    const requestResetBallot = () => {
      resetBallot()
    }
    return (
      <Main>
        <MainChild center>
          <Prose textCenter>
            <Text wordBreak>
              The id <strong>“{id}”</strong> does not match any contest in this
              election.
            </Text>
            <Button onClick={requestResetBallot}>Start Over</Button>
          </Prose>
        </MainChild>
      </Main>
    )
  }
  const prevContest = contests[currentContestIndex - 1]
  const nextContest = contests[currentContestIndex + 1]
  const vote = votes[contest.id]
  let isVoteComplete = !!vote
  if (contest.type === 'candidate') {
    isVoteComplete = contest.seats === ((vote as CandidateVote) || []).length
  }
  const isReviewMode = location.hash === '#review'
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
              to={`/review#${contest.id}`}
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
              to={
                nextContest
                  ? `/contests/${nextContest && nextContest.id}`
                  : '/pre-review'
              }
            >
              Next
            </LinkButton>
            <LinkButton
              id="previous"
              to={
                prevContest
                  ? `/contests/${prevContest && prevContest.id}`
                  : '/start'
              }
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
