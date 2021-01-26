import React, { useContext } from 'react'
import styled from 'styled-components'

import { useParams } from 'react-router-dom'
import find from '../utils/find'
import saveAsPDF from '../utils/saveAsPDF'

import {
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
} from '../config/types'
import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import Button from '../components/Button'
import HorizontalRule from '../components/HorizontalRule'
import ContestTally from '../components/ContestTally'
import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import Text from '../components/Text'
import LinkButton from '../components/LinkButton'
import routerPaths from '../routerPaths'
import { filterTalliesByParams } from '../lib/votecounting'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'
import LogoMark from '../components/LogoMark'

const TallyHeader = styled.div`
  page-break-before: always;
  h1 + p {
    margin-top: -1.5em;
  }
`

const TallyReportScreen: React.FC = () => {
  const { precinctId } = useParams<PrecinctReportScreenProps>()
  const { scannerId } = useParams<ScannerReportScreenProps>()
  const {
    electionDefinition,
    isOfficialResults,
    fullElectionTally,
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

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose className="no-print">
          <h1>{reportDisplayTitle()}</h1>
          {reportMeta}
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
          const party = election.parties.find((p) => p.id === partyId)
          const electionTitle = party
            ? `${party.fullName} ${election.title}`
            : election.title

          const tallyForReport = filterTalliesByParams(
            fullElectionTally!,
            election,
            { precinctId, scannerId, party }
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
                    {reportMeta}
                  </Prose>
                </TallyHeader>
                <HorizontalRule />
                <ContestTally
                  election={election}
                  electionTally={tallyForReport!}
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
                    {reportMeta}
                  </Prose>
                </TallyHeader>
                <HorizontalRule />
                <ContestTally
                  election={election}
                  electionTally={tallyForReport!}
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
                  {reportMeta}
                </Prose>
              </TallyHeader>
              <HorizontalRule />
              <div data-testid="tally-report-contents">
                <ContestTally
                  election={election}
                  electionTally={tallyForReport}
                />
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </React.Fragment>
  )
}

export default TallyReportScreen
