import React, { useContext, useState } from 'react'
import styled from 'styled-components'
import {
  CandidateContest,
  Election,
  VotesDict,
} from '@votingworks/ballot-encoder'


import {
  ButtonEventFunction,
  ElectionTally,
} from '../config/types'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Prose from '../components/Prose'
import Tally from '../components/Tally'

import { filterTalliesByParty, tallyVotes } from '../lib/votecounting'
import find from '../utils/find'
import NavigationScreen from '../components/NavigationScreen'

const ElectionTallyReport = styled.div`
  page-break-before: always;
`

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

  let votes: VotesDict[] = []

  precincts.forEach(precinctId => {
    const precinct = find(election.precincts, p => p.id === precinctId)
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
        let oneBallot: VotesDict = {}
        contests.forEach(contest => {
          if (contest.type === 'yesno') {
            oneBallot[contest.id] = ballotNum % 2 === 0 ? 'yes' : 'no'
          } else {
            if (contest.candidates.length > 0) {
              oneBallot[contest.id] = [
                contest.candidates[ballotNum % contest.candidates.length],
              ]
            }
          }
        })
        votes.push(oneBallot)
      }
    })
  })

  return votes
}

interface Precinct {
  name: string
  id: string
}

const initialPrecinct: Precinct = { id: '', name: '' }

const TestDeckScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e!
  const [electionTally, setElectionTally] = useState<ElectionTally | undefined>(
    undefined
  )

  const [precinct, setPrecinct] = useState<Precinct>(initialPrecinct)

  const selectPrecinct: ButtonEventFunction = event => {
    const { id = '', name = '' } = event.currentTarget.dataset
    setPrecinct({ id, name })
    const precinctId = id || undefined
    const votes = generateTestDeckBallots({ election, precinctId })
    const tally = tallyVotes({ election, precinctId, votes })
    setElectionTally(tally)
  }

  const resetDeck = () => {
    setPrecinct(initialPrecinct)
    setElectionTally(undefined)
  }

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map(bs => bs.partyId))
  )

  if (electionTally) {
    return (
      <React.Fragment>
        <NavigationScreen>
          <Prose >
            <h1>Test Deck Results</h1>
            <p>
              <strong>Election:</strong> {election.title}
              <br />
              <strong>Precinct:</strong> {precinct.name}
            </p>
            <p>
              <Button primary onPress={window.print}>
                Print Results Report
                  </Button>
            </p>
            <p>
              <Button small onPress={resetDeck}>
                Back to All Decks
                </Button>
            </p>
          </Prose>
        </NavigationScreen>
        <div className="print-only">
          {ballotStylePartyIds.map(partyId => {
            const party = election.parties.find(p => p.id === partyId)
            const electionTallyForParty = filterTalliesByParty({
              election,
              electionTally,
              party,
            })
            const electionTitle = `${party ? party.name : ''} ${
              election.title
              }`
            return (
              <ElectionTallyReport key={partyId}>
                <h1>Test Deck Results</h1>
                <p>
                  <strong>Election:</strong> {electionTitle}
                  <br />
                  <strong>Precinct:</strong> {precinct.name}
                </p>
                <Tally
                  election={election}
                  electionTally={electionTallyForParty}
                />
              </ElectionTallyReport>
            )
          })}
        </div>
      </React.Fragment>
    )
  }

  return (
    <NavigationScreen>
      <Prose>
        <h1>Test Ballot Deck Results</h1>
        <p>
          Select desired precinct for <strong>{election.title}</strong>.
      </p>
      </Prose>
      <p>
        <Button
          data-id=""
          data-name="All Precincts"
          fullWidth
          onPress={selectPrecinct}
        >
          <strong>All Precincts</strong>
        </Button>
      </p>
      <ButtonList>
        {election.precincts.map(p => (
          <Button
            key={p.id}
            data-id={p.id}
            data-name={p.name}
            fullWidth
            onPress={selectPrecinct}
          >
            {p.name}
          </Button>
        ))}
      </ButtonList>
    </NavigationScreen>
  )
}

export default TestDeckScreen
