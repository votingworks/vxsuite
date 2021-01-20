import React, { useContext } from 'react'
import styled from 'styled-components'
import { useParams } from 'react-router-dom'
import {
  getPrecinctById,
  Precinct,
  VotesDict,
} from '@votingworks/ballot-encoder'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import saveAsPDF from '../utils/saveAsPDF'

import PrintButton from '../components/PrintButton'
import ButtonList from '../components/ButtonList'
import Prose from '../components/Prose'
import ContestTally from '../components/ContestTally'
import Button from '../components/Button'

import { filterTalliesByParty, tallyVotesByContest } from '../lib/votecounting'
import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import {
  PrecinctReportScreenProps,
  Tally,
  ContestTallyMetaDictionary,
} from '../config/types'

import { generateTestDeckBallots } from '../utils/election'

const ElectionTallyReport = styled.div`
  page-break-before: always;
`

const allPrecincts: Precinct = {
  id: '',
  name: 'All Precincts',
}

const TestDeckScreen: React.FC = () => {
  const { electionDefinition } = useContext(AppContext)
  const { election } = electionDefinition!
  const { precinctId: p = '' } = useParams<PrecinctReportScreenProps>()
  const precinctId = p.trim()

  const precinct =
    precinctId === 'all'
      ? allPrecincts
      : getPrecinctById({ election, precinctId })

  const ballots = generateTestDeckBallots({
    election,
    precinctId: precinct?.id,
  })

  const votes: VotesDict[] = ballots.map(
    (ballots) => ballots.votes as VotesDict
  )

  const contestTallyMetadata = election.contests.reduce<ContestTallyMetaDictionary>(
    (contestTallyMeta, contest) => ({
      ...contestTallyMeta,
      [contest.id]: {
        ballots: votes.filter((vote) => !!vote[contest.id]).length,
        overvotes: 0,
        undervotes: 0,
      },
    }),
    {}
  )

  const electionTally: Tally = {
    precinctId: precinct?.id,
    numberOfBallotsCounted: ballots.length,
    castVoteRecords: new Map(),
    contestTallies: tallyVotesByContest({
      election,
      precinctId: precinct?.id,
      votes,
    }),
    contestTallyMetadata,
  }

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  )

  const handleSaveAsPDF = async () => {
    const succeeded = await saveAsPDF(
      'test-desk-tally-report',
      election,
      precinct?.name
    )
    if (!succeeded) {
      // eslint-disable-next-line no-alert
      window.alert(
        'Could not save PDF, it can only be saved to a USB device. (Or if "Cancel" was selected, ignore this message.)'
      )
    }
  }

  const pageTitle = 'Test Ballot Deck Tally'

  if (precinct?.name) {
    return (
      <React.Fragment>
        <NavigationScreen>
          <Prose>
            <h1>{pageTitle}</h1>
            <p>
              <strong>Election:</strong> {election.title}
              <br />
              <strong>Precinct:</strong> {precinct.name}
            </p>
            <p>
              <PrintButton primary>Print Results Report</PrintButton>
            </p>
            {window.kiosk && (
              <p>
                <Button onPress={handleSaveAsPDF}>
                  Save Results Report as PDF
                </Button>
              </p>
            )}
            <p>
              <LinkButton small to={routerPaths.testDecksTally}>
                Back to Test Deck list
              </LinkButton>
            </p>
          </Prose>
        </NavigationScreen>
        <div className="print-only">
          {ballotStylePartyIds.map((partyId) => {
            const party = election.parties.find((p) => p.id === partyId)
            const electionTallyForParty = filterTalliesByParty({
              election,
              electionTally,
              party,
            })
            const electionTitle = `${party ? party.fullName : ''} ${
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
                <ContestTally
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
        {[...election.precincts]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              ignorePunctuation: true,
            })
          )
          .map((p) => (
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
