import React, { useContext } from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/types'

import { useParams } from 'react-router-dom'
import find from '../utils/find'
import saveAsPDF from '../utils/saveAsPDF'
import * as format from '../utils/format'

import {
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  PartyReportScreenProps,
} from '../config/types'
import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import Button from '../components/Button'
import HorizontalRule from '../components/HorizontalRule'
import ContestTally from '../components/ContestTally'
import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Table, { TD } from '../components/Table'
import LinkButton from '../components/LinkButton'

import routerPaths from '../routerPaths'
import { filterTalliesByParams } from '../lib/votecounting'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'
import LogoMark from '../components/LogoMark'
import { filterExternalTalliesByParams } from '../utils/semsTallies'

const TallyHeader = styled.div`
  page-break-before: always;
  h1 + p {
    margin-top: -1.5em;
  }
`

interface Props {
  election: Election
  generatedAtTime: Date
  internalBallotCount: number
  externalBallotCount?: number
}

const TallyReportMetadata: React.FC<Props> = ({
  election,
  generatedAtTime,
  internalBallotCount,
  externalBallotCount,
}) => {
  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(generatedAtTime)
  const totalBallotCount = internalBallotCount + (externalBallotCount ?? 0)
  const ballotsByDataSource =
    externalBallotCount !== undefined ? (
      <React.Fragment>
        <h3>Ballots Cast by Data Source</h3>
        <Table data-testId="ballots-by-data-source">
          <tbody>
            <tr>
              <TD as="th">Data Source</TD>
              <TD as="th" textAlign="right">
                Number of Ballots Cast
              </TD>
            </tr>
            <tr data-testid="votingworks">
              <TD>VotingWorks Data</TD>
              <TD textAlign="right">{format.count(internalBallotCount)}</TD>
            </tr>
            <tr data-testid="externalvoterecords">
              <TD>Imported SEMS File</TD>
              <TD textAlign="right">{format.count(externalBallotCount)}</TD>
            </tr>
            <tr data-testid="total">
              <TD>
                <strong>Total</strong>
              </TD>
              <TD textAlign="right">
                <strong>{format.count(totalBallotCount)}</strong>
              </TD>
            </tr>
          </tbody>
        </Table>
      </React.Fragment>
    ) : (
      <Text>
        Total Number of Ballots Cast: {format.count(totalBallotCount)}
      </Text>
    )

  return (
    <React.Fragment>
      <p>
        {electionDate}, {election.county.name}, {election.state}
        <br />
        <Text small as="span">
          This report was created on {generatedAt}
        </Text>
      </p>
      {ballotsByDataSource}
    </React.Fragment>
  )
}

const TallyReportScreen: React.FC = () => {
  const {
    precinctId: precinctIdFromProps,
  } = useParams<PrecinctReportScreenProps>()
  const { scannerId } = useParams<ScannerReportScreenProps>()
  const { partyId: partyIdFromProps } = useParams<PartyReportScreenProps>()
  const {
    electionDefinition,
    isOfficialResults,
    fullElectionTally,
    fullElectionExternalTally,
    isTabulationRunning,
  } = useContext(AppContext)

  if (isTabulationRunning) {
    return (
      <NavigationScreen mainChildCenter>
        <Prose textCenter>
          <h1>Building Tabulation Report...</h1>
          <p>This may take a few seconds.</p>
        </Prose>
      </NavigationScreen>
    )
  }

  const { election } = electionDefinition!
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial'

  const ballotStylePartyIds =
    partyIdFromProps !== undefined
      ? [partyIdFromProps]
      : Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)))

  const precinctIds =
    precinctIdFromProps === 'all'
      ? election.precincts.map((p) => p.id)
      : [precinctIdFromProps]

  const precinctName =
    (precinctIdFromProps &&
      precinctIdFromProps !== 'all' &&
      find(election.precincts, (p) => p.id === precinctIdFromProps).name) ||
    undefined

  const reportDisplayTitle = () => {
    if (precinctName) {
      return `${statusPrefix} Precinct Tally Report for ${precinctName}`
    }
    if (scannerId) {
      return `${statusPrefix} Scanner Tally Report for Scanner ${scannerId}`
    }
    if (precinctIdFromProps === 'all') {
      return `${statusPrefix} ${election.title} Tally Reports for All Precincts`
    }
    if (partyIdFromProps) {
      const party = election.parties.find((p) => p.id === partyIdFromProps)!
      return `${statusPrefix} Tally Report for ${party.fullName}`
    }
    return `${statusPrefix} ${election.title} Tally Report`
  }

  const handleSaveAsPDF = async () => {
    const succeeded = await saveAsPDF(
      'tabulation-report',
      election,
      precinctName
    )
    if (!succeeded) {
      // eslint-disable-next-line no-alert
      window.alert(
        'Could not save PDF, it can only be saved to a USB device. (Or if "Cancel" was selected, ignore this message.)'
      )
    }
  }

  const generatedAtTime = new Date()
  const singlePrecinctId = precinctIds.length === 1 ? precinctIds[0] : undefined
  const outerTallyReport = filterTalliesByParams(fullElectionTally!, election, {
    precinctId: singlePrecinctId,
    scannerId,
    partyId: partyIdFromProps,
  })
  const outerExternalTallyReport = filterExternalTalliesByParams(
    fullElectionExternalTally,
    election,
    { precinctId: singlePrecinctId, scannerId, partyId: partyIdFromProps }
  )

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose className="no-print">
          <h1>{reportDisplayTitle()}</h1>
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
            internalBallotCount={outerTallyReport.numberOfBallotsCounted}
            externalBallotCount={
              outerExternalTallyReport?.numberOfBallotsCounted
            }
          />
          <p>
            <PrintButton primary>Print {statusPrefix} Tally Report</PrintButton>
          </p>
          {window.kiosk && (
            <p>
              <Button onPress={handleSaveAsPDF}>
                Save {statusPrefix} Tally Report as PDF
              </Button>
            </p>
          )}
          <p>
            <LinkButton small to={routerPaths.tally}>
              Back to Tally Index
            </LinkButton>
          </p>
        </Prose>
      </NavigationScreen>
      <div className="print-only">
        <LogoMark />
        {ballotStylePartyIds.map((partyId) => {
          return precinctIds.map((precinctId) => {
            const party = election.parties.find((p) => p.id === partyId)
            const electionTitle = party
              ? `${party.fullName} ${election.title}`
              : election.title

            const tallyForReport = filterTalliesByParams(
              fullElectionTally!,
              election,
              { precinctId, scannerId, partyId }
            )
            const externalTallyForReport = filterExternalTalliesByParams(
              fullElectionExternalTally,
              election,
              { precinctId, partyId }
            )

            if (precinctId) {
              const precinctName = find(
                election.precincts,
                (p) => p.id === precinctId
              ).name
              return (
                <React.Fragment key={`${partyId}-${precinctId}`}>
                  <TallyHeader key={precinctId}>
                    <Prose maxWidth={false}>
                      <h1>
                        {statusPrefix} Precinct Tally Report for: {precinctName}
                      </h1>
                      <h2>{electionTitle}</h2>
                      <TallyReportMetadata
                        generatedAtTime={generatedAtTime}
                        election={election}
                        internalBallotCount={
                          tallyForReport.numberOfBallotsCounted
                        }
                        externalBallotCount={
                          externalTallyForReport?.numberOfBallotsCounted
                        }
                      />
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <h2>Contest Tallies</h2>
                  <ContestTally
                    election={election}
                    electionTally={tallyForReport}
                    externalTally={externalTallyForReport}
                    precinctId={precinctId}
                  />
                </React.Fragment>
              )
            }

            if (scannerId) {
              return (
                <React.Fragment key={`${partyId}-${scannerId}`}>
                  <TallyHeader key={scannerId}>
                    <Prose maxWidth={false}>
                      <h1>
                        {statusPrefix} Scanner Tally Report for Scanner{' '}
                        {scannerId}
                      </h1>
                      <h2>{electionTitle}</h2>
                      <TallyReportMetadata
                        generatedAtTime={generatedAtTime}
                        election={election}
                        internalBallotCount={
                          tallyForReport?.numberOfBallotsCounted ?? 0
                        }
                      />
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <h2>Contest Tallies</h2>
                  <ContestTally
                    election={election}
                    electionTally={tallyForReport}
                  />
                </React.Fragment>
              )
            }

            return (
              <React.Fragment key={partyId || 'none'}>
                <TallyHeader>
                  <Prose maxWidth={false}>
                    <h1>
                      {statusPrefix} {electionTitle} Tally Report
                    </h1>
                    <TallyReportMetadata
                      generatedAtTime={generatedAtTime}
                      election={election}
                      internalBallotCount={
                        tallyForReport.numberOfBallotsCounted
                      }
                      externalBallotCount={
                        externalTallyForReport?.numberOfBallotsCounted
                      }
                    />
                  </Prose>
                </TallyHeader>
                <h2>Contest Tallies</h2>
                <HorizontalRule />
                <div data-testid="tally-report-contents">
                  <ContestTally
                    election={election}
                    electionTally={tallyForReport}
                    externalTally={externalTallyForReport}
                  />
                </div>
              </React.Fragment>
            )
          })
        })}
      </div>
    </React.Fragment>
  )
}

export default TallyReportScreen
