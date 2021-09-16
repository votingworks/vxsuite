import QRCodeReact from '@votingworks/qrcode.react'
import { ElectionDefinition, Tally } from '@votingworks/types'
import React, { useState, useEffect } from 'react'
import { format, find, compressTally } from '@votingworks/utils'
import {
  PrecinctSelection,
  PrecinctSelectionKind,
} from './PrecinctScannerPollsReport'
import { ContestTally } from './ContestTally'
import {
  PrintableContainer,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  Text,
  LogoMark,
} from '.'
import { TallyReportSummary } from './TallyReportSummary'

interface Props {
  currentDateTime: string
  electionDefinition: ElectionDefinition
  machineId: string
  precinctSelection: PrecinctSelection
  reportPurpose: string
  isPollsOpen: boolean
  tally: Tally
}

export const PrecinctScannerTallyReport = ({
  currentDateTime,
  electionDefinition,
  machineId,
  precinctSelection,
  reportPurpose,
  isPollsOpen,
  tally,
}: Props): JSX.Element => {
  const { election, electionHash } = electionDefinition
  const [resultsReportingUrl, setResultsReportingUrl] = useState('')
  const precinctId =
    precinctSelection.kind === PrecinctSelectionKind.SinglePrecinct
      ? precinctSelection.precinctId
      : undefined
  const precinctName =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(election.precincts, (p) => p.id === precinctSelection.precinctId)
          .name
  const pollsAction = isPollsOpen ? 'Opened' : 'Closed'
  const reportTitle = `${precinctName} Polls ${pollsAction} Tally Report`
  const electionDate = format.localeWeekdayAndDate(new Date(election.date))

  useEffect(() => {
    void (async () => {
      if (tally.numberOfBallotsCounted > 0 && !isPollsOpen) {
        const compressedTally = compressTally(election, tally)
        const stringToSign = `${electionHash}.${machineId}.${window.btoa(
          JSON.stringify(compressedTally)
        )}`
        const signature = await window.kiosk?.sign({
          signatureType: 'vx-results-reporting',
          payload: stringToSign,
        })

        setResultsReportingUrl(
          `https://results.voting.works/?p=${stringToSign}&s=${signature}`
        )
      }
    })()
  }, [
    setResultsReportingUrl,
    election,
    electionHash,
    machineId,
    tally,
    isPollsOpen,
  ])

  return (
    <PrintableContainer>
      <TallyReport>
        <ReportSection>
          <LogoMark />
          <Prose maxWidth={false}>
            <h1>{reportTitle}</h1>
            <h2>{election.title}</h2>
            <p>
              {electionDate}, {election.county.name}, {election.state}
              <br /> <br />
              This report should be <strong>{reportPurpose}.</strong>
              <br />
              <Text small as="span">
                Polls {pollsAction} and report created on {currentDateTime}
              </Text>
            </p>
          </Prose>
          <TallyReportColumns>
            <TallyReportSummary
              totalBallotCount={tally.numberOfBallotsCounted}
              ballotCountsByVotingMethod={tally.ballotCountsByVotingMethod}
            />
            <ContestTally
              election={election}
              electionTally={tally}
              externalTallies={[]}
              precinctId={precinctId}
            />
          </TallyReportColumns>
        </ReportSection>
        {resultsReportingUrl && (
          <ReportSection>
            <LogoMark />
            <Prose maxWidth={false}>
              <h1>Automatic Election Results Reporting</h1>
              <h2>{election.title}</h2>
              <p>
                {electionDate}, {election.county.name}, {election.state}
                <br /> <br />
                This report should be <strong>{reportPurpose}.</strong>
                <br />
                <Text small as="span">
                  Polls {pollsAction} and report created on {currentDateTime}
                </Text>
              </p>
              <p>
                This QR code contains the tally, authenticated with a digital
                signature. Scan the QR code and follow the URL for details.
              </p>
              <QRCodeReact
                renderAs="svg"
                value={resultsReportingUrl}
                level="H"
              />
            </Prose>
          </ReportSection>
        )}
      </TallyReport>
    </PrintableContainer>
  )
}
