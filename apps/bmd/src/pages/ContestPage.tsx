import React, { useContext } from 'react'
import { Redirect, RouteComponentProps } from 'react-router-dom'

import ordinal from '../utils/ordinal'

import { CandidateVote, OptionalYesNoVote } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import CandidateContest from '../components/CandidateContest'
import ElectionInfo from '../components/ElectionInfo'
import LinkButton from '../components/LinkButton'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Sidebar from '../components/Sidebar'
import Text from '../components/Text'
import YesNoContest from '../components/YesNoContest'
import SettingsTextSize from '../components/SettingsTextSize'

interface ContestParams {
  contestNumber: string
}

const ContestPage = (props: RouteComponentProps<ContestParams>) => {
  const { contestNumber } = props.match.params
  const {
    ballotStyleId,
    contests,
    election,
    precinctId,
    resetBallot,
    setUserSettings,
    updateVote,
    userSettings,
    votes,
  } = useContext(BallotContext)

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
    <Screen>
      {contest.type === 'candidate' && (
        <CandidateContest
          aria-live="assertive"
          key={contest.id}
          contest={contest}
          parties={election.parties}
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
      <Sidebar
        footer={
          <React.Fragment>
            <SettingsTextSize
              userSettings={userSettings}
              setUserSettings={setUserSettings}
            />
            <ElectionInfo
              election={election}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              horizontal
            />
          </React.Fragment>
        }
      >
        {isReviewMode ? (
          <Prose>
            <Text center>
              This is the <strong>{ordinal(currentContestIndex + 1)}</strong> of{' '}
              {contests.length} contests.
            </Text>
            <p>
              <LinkButton
                big
                primary={isVoteComplete}
                to={`/review#contest-${contest.id}`}
                id="next"
              >
                Review →
              </LinkButton>
            </p>
          </Prose>
        ) : (
          <Prose>
            <Text center>
              This is the <strong>{ordinal(currentContestIndex + 1)}</strong> of{' '}
              {contests.length} contests.
            </Text>
            <p>
              <LinkButton
                big
                id="next"
                primary={isVoteComplete}
                to={nextContest ? `/contests/${nextContestIndex}` : '/review'}
              >
                Next →
              </LinkButton>
            </p>
            <p>
              <LinkButton
                small
                id="previous"
                to={prevContest ? `/contests/${prevContestIndex}` : '/'}
              >
                ← Back
              </LinkButton>
            </p>
          </Prose>
        )}
      </Sidebar>
    </Screen>
  )
}

export default ContestPage
