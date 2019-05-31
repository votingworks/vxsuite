import React, { useState } from 'react'

import {
  ButtonEvent,
  CandidateContest,
  Election,
  VotesDict,
} from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'
import PrintedBallot from '../components/PrintedBallot'

interface Ballot {
  ballotId?: string
  precinctId: string
  ballotStyleId: string
  votes: VotesDict
}

interface GenerateTestDeckParams {
  election: Election
  precinctId?: string
}

const generateTestDeckBallots = ({
  election,
  precinctId,
}: GenerateTestDeckParams) => {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map(p => p.id)

  let ballots: Ballot[] = []

  precincts.forEach(precinctId => {
    const precinct = election.precincts.find(p => p.id === precinctId)!
    const precinctBallotStyles = election.ballotStyles.filter(bs =>
      bs.precincts.includes(precinct.id)
    )

    precinctBallotStyles.forEach(ballotStyle => {
      const contests = election.contests.filter(
        c =>
          ballotStyle.districts.includes(c.districtId) &&
          ballotStyle.partyId === c.partyId
      )

      const numBallots = Math.max(
        ...contests.map(c =>
          c.type === 'yesno' ? 2 : (c as CandidateContest).candidates.length
        )
      )

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum++) {
        let votes: VotesDict = {}
        contests.forEach(contest => {
          if (contest.type === 'yesno') {
            votes[contest.id] = ballotNum % 2 === 0 ? 'yes' : 'no'
          } else {
            votes[contest.id] = [
              contest.candidates[ballotNum % contest.candidates.length],
            ]
          }
        })
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId,
          votes,
        })
      }
    })
  })

  return ballots
}

interface Precinct {
  name: string
  id: string
}

interface Props {
  election: Election
  hideTestDeck: () => void
  isLiveMode: boolean
}

const initialPrecinct: Precinct = { id: '', name: '' }

const TestBallotDeckScreen = ({
  election,
  hideTestDeck,
  isLiveMode,
}: Props) => {
  const [ballots, setBallots] = useState<Ballot[]>([])
  const [precinct, setPrecinct] = useState<Precinct>(initialPrecinct)

  const selectPrecinct = (event: ButtonEvent) => {
    const { id = '', name = '' } = (event.target as HTMLElement).dataset
    setPrecinct({ name, id })
    const selectedBallots = generateTestDeckBallots({
      election,
      precinctId: id,
    })
    setBallots(selectedBallots)
  }

  const resetDeck = () => {
    setBallots([])
    setPrecinct(initialPrecinct)
  }

  return (
    <React.Fragment>
      <Main className="invisible-scrollbar">
        <MainChild maxWidth={false}>
          {ballots.length ? (
            <React.Fragment>
              <Prose className="no-print">
                <h1>Test Ballots Deck for {precinct.name}</h1>
                <p>
                  <Button primary onClick={window.print}>
                    Print {ballots.length} ballots
                  </Button>
                </p>
                <p>
                  <Button small onClick={resetDeck}>
                    Back to All Decks
                  </Button>
                </p>
              </Prose>
              {ballots.map((ballot, i) => {
                const ballotId = `temp-ballot-id-${i}`
                return (
                  <PrintedBallot
                    key={ballotId}
                    ballotId={undefined} // TODO: add ballotId here: https://github.com/votingworks/bmd/issues/424
                    ballotStyleId={ballot.ballotStyleId}
                    election={election}
                    isLiveMode={isLiveMode}
                    precinctId={ballot.precinctId}
                    votes={ballot.votes}
                  />
                )
              })}
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Prose>
                <h1>Test Ballot Decks</h1>
                <p>
                  Select desired precinct for <strong>{election.title}</strong>.
                </p>
              </Prose>
              <p>
                <Button
                  data-id=""
                  data-name="All Precincts"
                  fullWidth
                  key="all-precincts"
                  onClick={selectPrecinct}
                >
                  <strong>All Precincts</strong>
                </Button>
              </p>
              <ButtonList>
                {election.precincts.map(p => (
                  <Button
                    data-id={p.id}
                    data-name={p.name}
                    fullWidth
                    key={p.id}
                    onClick={selectPrecinct}
                  >
                    {p.name}
                  </Button>
                ))}
              </ButtonList>
            </React.Fragment>
          )}
        </MainChild>
      </Main>
      <MainNav title="Clerk Actions">
        <Button small onClick={hideTestDeck}>
          Dashboard
        </Button>
      </MainNav>
    </React.Fragment>
  )
}

export default TestBallotDeckScreen
