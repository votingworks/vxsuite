import React, { useContext } from 'react'
import styled from 'styled-components'
import { useParams } from 'react-router-dom'
import { routerPaths } from '../components/ElectionManager'
import {
  CandidateContest,
  Election,
  VotesDict,
  getPrecinctById,
  Precinct,
} from '@votingworks/ballot-encoder'

import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import ButtonList from '../components/ButtonList'
import Prose from '../components/Prose'
import Tally from '../components/Tally'

import { filterTalliesByParty, tallyVotes } from '../lib/votecounting'
import find from '../utils/find'
import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import { PrecinctReportScreenProps } from '../config/types'

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

const allPrecincts: Precinct = {
  id: '', name: 'All Precincts'
}

const TestDeckScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e!
  const { precinctId: p = '' } = useParams<PrecinctReportScreenProps>()
  const precinctId = p.trim()

  const precinct = precinctId === 'all'
		 ? allPrecincts
		 : getPrecinctById({ election, precinctId })

  const votes = generateTestDeckBallots({ election, precinctId: precinct?.id })
  const electionTally = tallyVotes({ election, precinctId: precinct?.id, votes })

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map(bs => bs.partyId))
  )

  const pageTitle = 'Test Ballot Deck Tally'

  if (precinct?.name) {
    return (
      <React.Fragment>
        <NavigationScreen>
          <Prose >
            <h1>{pageTitle}</h1>
            <p>
              <strong>Election:</strong> {election.title}
              <br />
              <strong>Precinct:</strong> {precinct.name}
            </p>
            <p>
              <PrintButton primary>
                Print Results Report
              </PrintButton>
            </p>
            <p>
              <LinkButton small to={routerPaths.testDecksTally}>
                back to Test Deck list
              </LinkButton>
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
              <ElectionTallyReport key={partyId || 'no-party'}>
                <h1>{pageTitle}</h1>
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
        <h1>{pageTitle}</h1>
        <p>
          Select desired precinct for <strong>{election.title}</strong>.
      </p>
      </Prose>
      <p>
        <LinkButton
          to={routerPaths.testDeckResultsReport({ precinctId: 'all' })}
          fullWidth
        >
          <strong>All Precincts</strong>
        </LinkButton>
      </p>
      <ButtonList>
        {election.precincts.map(p => (
          <LinkButton
            key={p.id}
            to={routerPaths.testDeckResultsReport({ precinctId: p.id })}
            fullWidth
          >
            {p.name}
          </LinkButton>
        ))}
      </ButtonList>
    </NavigationScreen>
  )
}

export default TestDeckScreen
