import React, { useContext } from 'react'
import styled from 'styled-components'

import { useParams, useHistory } from 'react-router-dom'
import find from '../utils/find'

import { fullTallyVotes } from '../lib/votecounting'

import {
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
} from '../config/types'
import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import HorizontalRule from '../components/HorizontalRule'
import ContestTally from '../components/ContestTally'
import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import Text from '../components/Text'
import LinkButton from '../components/LinkButton'
import routerPaths from '../routerPaths'
import { filterTalliesByParty } from '../lib/votecounting'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'

const TallyHeader = styled.div`
  page-break-before: always;
  h1 + p {
    margin-top: -1.5em;
  }
`

const TallyReportScreen = () => {
  const history = useHistory()
  const { precinctId } = useParams<PrecinctReportScreenProps>()
  const { scannerId } = useParams<ScannerReportScreenProps>()
  const { castVoteRecordFiles, election: e, isOfficialResults } = useContext(
    AppContext
  )
  const election = e!
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial'

  if (castVoteRecordFiles.castVoteRecords.length === 0) {
    history.replace(routerPaths.tally)
  }

  const fullElectionTally = fullTallyVotes({
    election,
    castVoteRecords: castVoteRecordFiles.castVoteRecords,
  })

  const electionPrecinctTallies = Object.values(
    fullElectionTally.precinctTallies
  )

  const electionScannerTallies = Object.values(fullElectionTally.scannerTallies)

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  )

  const precinctName =
    precinctId && find(election.precincts, (p) => p.id === precinctId).name

  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(new Date())

  const reportMeta = (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as="span">
        This report was created on {generatedAt}
      </Text>
    </p>
  )

  const reportDisplayTitle = () => {
    if (precinctName) {
      return `${statusPrefix} Precinct Tally Report for ${precinctName}`
    }
    if (scannerId) {
      return `${statusPrefix} Scanner Tally Report for Scanner ${scannerId}`
    }
    return `${statusPrefix} ${election.title} Tally Report`
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose className="no-print">
          <h1>{reportDisplayTitle()}</h1>
          {reportMeta}
          <p>
            <PrintButton primary>Print {statusPrefix} Tally Report</PrintButton>
          </p>
          <p>
            <LinkButton small to={routerPaths.tally}>
              Back to Tally Index
            </LinkButton>
          </p>
        </Prose>
      </NavigationScreen>
      <div className="print-only">
        {ballotStylePartyIds.map((partyId) => {
          let precinctTallies = electionPrecinctTallies
          let scannerTallies = electionScannerTallies
          let overallTally = fullElectionTally.overallTally

          const party = election.parties.find((p) => p.id === partyId)
          const electionTitle = party
            ? `${party.fullName} ${election.title}`
            : election.title

          if (party) {
            overallTally = filterTalliesByParty({
              election,
              electionTally: fullElectionTally.overallTally,
              party,
            })
            precinctTallies = electionPrecinctTallies.map((precinctTally) =>
              filterTalliesByParty({
                election,
                electionTally: precinctTally!,
                party,
              })
            )
            scannerTallies = electionScannerTallies.map((scannerTally) =>
              filterTalliesByParty({
                election,
                electionTally: scannerTally!,
                party,
              })
            )
          }

          if (precinctId) {
            precinctTallies = precinctTallies.filter(
              (pt) => pt?.precinctId === precinctId
            )
            return precinctTallies.map((precinctTally) => {
              const precinctid = precinctTally?.precinctId
              const precinctName = find(
                election.precincts,
                (p) => p.id === precinctid
              ).name
              return (
                <React.Fragment key={`${partyId}-${precinctid}` || 'none'}>
                  <TallyHeader key={precinctid}>
                    <Prose maxWidth={false}>
                      <h1>
                        {statusPrefix} Precinct Tally Report for: {precinctName}
                      </h1>
                      {reportMeta}
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <ContestTally
                    election={election}
                    electionTally={precinctTally!}
                  />
                </React.Fragment>
              )
            })
          }

          if (scannerId) {
            scannerTallies = scannerTallies.filter(
              (pt) => pt?.scannerId === scannerId
            )
            return scannerTallies.map((scannerTally) => {
              const scannerId = scannerTally?.scannerId
              return (
                <React.Fragment key={`${partyId}-${scannerId}` || 'none'}>
                  <TallyHeader key={scannerId}>
                    <Prose maxWidth={false}>
                      <h1>
                        {statusPrefix} Scanner Tally Report for Scanner{' '}
                        {scannerId}
                      </h1>
                      {reportMeta}
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <ContestTally
                    election={election}
                    electionTally={scannerTally!}
                  />
                </React.Fragment>
              )
            })
          }

          return (
            <React.Fragment key={partyId || 'none'}>
              <TallyHeader>
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} {electionTitle} Tally Report
                  </h1>
                  {reportMeta}
                </Prose>
              </TallyHeader>
              <HorizontalRule />
              <ContestTally election={election} electionTally={overallTally} />
            </React.Fragment>
          )
        })}
      </div>
    </React.Fragment>
  )
}

export default TallyReportScreen
