import React, { useContext } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'

import BallotContext from '../contexts/ballotContext'

import Article from '../components/Article'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import SingleCandidateContest from '../components/SingleCandidateContest'

const FieldSet = styled.fieldset`
  margin: 0;
  border: none;
  padding: 0;
`
const Legend = styled.legend`
  font-weight: bold;
  font-size: 2em;
  margin: 0.67em 0;
`

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

  if (!contest || !contest.type) {
    return (
      <Article>
        <h1>Error</h1>
        <p>
          no contest exists for id <code>{id}</code>
        </p>
        <LinkButton to="/">Start Over</LinkButton>
      </Article>
    )
  }
  let contestChoices
  if (contest.type === 'plurality') {
    contestChoices = (
      <SingleCandidateContest
        contest={contest}
        vote={votes[contest.id]}
        updateVote={updateVote}
      />
    )
  }
  return (
    <React.Fragment>
      <ButtonBar
        centerContent={<LinkButton to="/summary">View Summary</LinkButton>}
      />
      <Article>
        <FieldSet>
          <Legend>{contest.title}</Legend>
          {contestChoices}
        </FieldSet>
      </Article>
      <ButtonBar
        leftContent={
          <LinkButton
            disabled={!prevContest}
            to={`/contests/${prevContest && prevContest.id}`}
          >
            Previous
          </LinkButton>
        }
        rightContent={
          nextContest ? (
            <LinkButton
              disabled={!nextContest}
              to={`/contests/${nextContest && nextContest.id}`}
            >
              Next
            </LinkButton>
          ) : (
            <LinkButton to="/summary">View Ballot</LinkButton>
          )
        }
      />
    </React.Fragment>
  )
}

export default ContestPage
