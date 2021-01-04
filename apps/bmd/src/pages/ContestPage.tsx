import React, { useContext, useEffect, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import { CandidateVote, OptionalYesNoVote } from '@votingworks/ballot-encoder'

import ordinal from '../utils/ordinal'

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
import TextIcon from '../components/TextIcon'
import MsEitherNeitherContest from '../components/MsEitherNeitherContest'

interface ContestParams {
  contestNumber: string
}

const ContestPage: React.FC<RouteComponentProps<ContestParams>> = (props) => {
  const isReviewMode = window.location.hash === '#review'
  const { contestNumber } = props.match.params
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    precinctId,
    setUserSettings,
    updateVote,
    userSettings,
    votes,
  } = useContext(BallotContext)
  const { election } = electionDefinition
  const currentContestIndex = parseInt(contestNumber, 10)
  const contest = contests[currentContestIndex]

  const vote = votes[contest.id]

  const [isVoteComplete, setIsVoteComplete] = useState(false)

  const prevContestIndex = currentContestIndex - 1
  const prevContest = contests[prevContestIndex]

  const nextContestIndex = currentContestIndex + 1
  const nextContest = contests[nextContestIndex]

  useEffect(() => {
    const calculateIsVoteComplete = () => {
      /* istanbul ignore else */
      if (contest.type === 'yesno') {
        setIsVoteComplete(!!vote)
      } else if (contest.type === 'candidate') {
        setIsVoteComplete(
          contest.seats === ((vote as CandidateVote) ?? []).length
        )
      } else if (contest.type === 'ms-either-neither') {
        setIsVoteComplete(
          votes[contest.pickOneContestId]?.length === 1 ||
            votes[contest.eitherNeitherContestId]?.[0] === 'no'
        )
      }
    }
    calculateIsVoteComplete()
  }, [contest, vote, votes])

  return (
    <Screen>
      {contest.type === 'candidate' && (
        <CandidateContest
          aria-live="assertive"
          key={contest.id}
          contest={contest}
          parties={election.parties}
          vote={(vote ?? []) as CandidateVote}
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
      {contest.type === 'ms-either-neither' && (
        <MsEitherNeitherContest
          key={contest.id}
          contest={contest}
          eitherNeitherContestVote={
            votes[contest.eitherNeitherContestId] as OptionalYesNoVote
          }
          pickOneContestVote={
            votes[contest.pickOneContestId] as OptionalYesNoVote
          }
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
              electionDefinition={electionDefinition}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              horizontal
            />
          </React.Fragment>
        }
      >
        <Prose>
          <Text center>
            This is the <strong>{ordinal(currentContestIndex + 1)}</strong> of{' '}
            {contests.length} contests.
          </Text>
          {isReviewMode ? (
            <React.Fragment>
              <p>
                <LinkButton
                  big
                  primary={isVoteComplete}
                  to={`/review#contest-${contest.id}`}
                  id="next"
                >
                  <TextIcon arrowRight white={isVoteComplete}>
                    Review
                  </TextIcon>
                </LinkButton>
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p>
                <LinkButton
                  big
                  id="next"
                  primary={isVoteComplete}
                  to={nextContest ? `/contests/${nextContestIndex}` : '/review'}
                >
                  <TextIcon arrowRight white={isVoteComplete}>
                    Next
                  </TextIcon>
                </LinkButton>
              </p>
              <p>
                <LinkButton
                  small
                  id="previous"
                  to={prevContest ? `/contests/${prevContestIndex}` : '/'}
                >
                  <TextIcon arrowLeft>Back</TextIcon>
                </LinkButton>
              </p>
            </React.Fragment>
          )}
        </Prose>
      </Sidebar>
    </Screen>
  )
}

export default ContestPage
