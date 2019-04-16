import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import { CandidateVote, OptionalYesNoVote } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import ButtonBar from '../components/ButtonBar'
import CandidateContest from '../components/CandidateContest'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
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
  const { election, updateVote, votes } = useContext(BallotContext)
  const { contests, bmdConfig } = election!
  const { showHelpPage, showSettingsPage } = bmdConfig!
  const currentContestIndex = contests.findIndex(x => x.id === id)
  const contest = contests[currentContestIndex]
  const prevContest = contests[currentContestIndex - 1]
  const nextContest = contests[currentContestIndex + 1]
  const vote = contest && votes[contest.id]

  // TODO:
  // - confirm intent when navigating away without selecting a candidate

  return (
    <React.Fragment>
      {!contest && (
        <Main>
          <MainChild>
            <h1>Error</h1>
            <p>
              no contest exists for id <code>“{id}”</code>
            </p>
            <LinkButton to="/">Start Over</LinkButton>
          </MainChild>
        </Main>
      )}
      {contest && contest.type === 'candidate' && (
        <CandidateContest
          key={contest.id}
          contest={contest}
          vote={(vote || []) as CandidateVote}
          updateVote={updateVote}
        />
      )}
      {contest && contest.type === 'yesno' && (
        <YesNoContest
          key={contest.id}
          contest={contest}
          vote={vote as OptionalYesNoVote}
          updateVote={updateVote}
        />
      )}
      <ButtonBar>
        {nextContest ? (
          <LinkButton
            id="next"
            key="next"
            primary={!!vote}
            to={`/contests/${nextContest && nextContest.id}`}
          >
            Next
          </LinkButton>
        ) : (
          <LinkButton primary={!!vote} to="/review" key="review" id="next">
            Next
          </LinkButton>
        )}
        {prevContest ? (
          <LinkButton
            id="previous"
            to={`/contests/${prevContest && prevContest.id}`}
            key="previous"
          >
            Back
          </LinkButton>
        ) : (
          <LinkButton key="backtostart" to="/start" id="previous">
            Back
          </LinkButton>
        )}
        <Progress center white>
          {currentContestIndex + 1} of {contests.length}
        </Progress>
      </ButtonBar>
      <ButtonBar
        secondary
        separatePrimaryButton
        centerOnlyChild={!showHelpPage && !showSettingsPage && false}
      >
        <LinkButton to="/review">Review</LinkButton>
        {showHelpPage && <LinkButton to="/help">Help</LinkButton>}
        {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
      </ButtonBar>
    </React.Fragment>
  )
}

export default ContestPage
