import React, { useContext } from 'react'
import { useParams } from 'react-router-dom'
import { getPrecinctById, Precinct, VotesDict } from '@votingworks/types'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import { saveReportPDF } from '../utils/saveAsPDF'

import PrintButton from '../components/PrintButton'
import ButtonList from '../components/ButtonList'
import Prose from '../components/Prose'
import ContestTally from '../components/ContestTally'
import Button from '../components/Button'

import { filterTalliesByParty, tallyVotesByContest } from '../lib/votecounting'
import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import { PrecinctReportScreenProps, Tally, VotingMethod } from '../config/types'

import { generateTestDeckBallots } from '../utils/election'
import {
  ReportSection,
  TallyReportColumns,
  TallyReportTitle,
} from './TallyReportScreen'
import LogoMark from '../components/LogoMark'
import TallyReportMetadata from '../components/TallyReportMetadata'

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

  const electionTally: Tally = {
    numberOfBallotsCounted: ballots.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes,
    }),
    ballotCountsByVotingMethod: { [VotingMethod.Unknown]: ballots.length },
  }

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  )

  const handleSaveAsPDF = async () => {
    const succeeded = await saveReportPDF(
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

  const generatedAtTime = new Date()

  if (precinct?.name) {
    return (
      <React.Fragment>
        <NavigationScreen>
          <div>
            <strong>{pageTitle}</strong> for {election.title}
          </div>
          <Prose>
            <TallyReportTitle
              style={{ marginBottom: '0.75em', marginTop: '0.25em' }}
            >
              {precinctId === 'all' ? '' : 'Precinct'} Tally Report for{' '}
              <strong>{precinct.name}</strong>
            </TallyReportTitle>
            <TallyReportMetadata
              generatedAtTime={generatedAtTime}
              election={election}
            />
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
              <ReportSection key={partyId || 'no-party'}>
                <LogoMark />
                <div>
                  <strong>{pageTitle}</strong> for {electionTitle}
                </div>
                <Prose maxWidth={false}>
                  <TallyReportTitle
                    style={{ marginBottom: '0.75em', marginTop: '0.25em' }}
                  >
                    {precinctId === 'all' ? '' : 'Precinct'} Tally Report for{' '}
                    <strong>{precinct.name}</strong>
                  </TallyReportTitle>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <ContestTally
                    election={election}
                    electionTally={electionTallyForParty}
                  />
                </TallyReportColumns>
              </ReportSection>
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
