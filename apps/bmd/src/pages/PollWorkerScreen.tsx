import { DateTime } from 'luxon'
import React, { useState, useEffect, useCallback } from 'react'
import pluralize from 'pluralize'

import { Precinct, ElectionDefinition, Optional } from '@votingworks/types'
import { Button, ButtonList } from '@votingworks/ui'

import {
  formatFullDateTimeZone,
  Tally,
  CardTally,
  TallySourceMachineType,
  BMDCardTally,
  PrecinctScannerCardTally,
  combineTallies,
} from '@votingworks/utils'

import { MachineConfig } from '../config/types'

import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import { Printer } from '../utils/printer'
import PollsReport from '../components/PollsReport'
import PrecinctTallyReport from '../components/PrecinctTallyReport'
import Loading from '../components/Loading'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals'
import HorizontalRule from '../components/HorizontalRule'
import Table from '../components/Table'
import VersionsData from '../components/VersionsData'

interface Props {
  activateCardlessBallotStyleId: (id: string) => void
  resetCardlessBallot: () => void
  appPrecinctId: string
  ballotsPrintedCount: number
  ballotStyleId?: string
  electionDefinition: ElectionDefinition
  enableLiveMode: () => void
  hasVotes: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  machineConfig: MachineConfig
  printer: Printer
  tally: Tally
  togglePollsOpen: () => void
  saveTallyToCard: (cardTally: CardTally) => void
  talliesOnCard: Optional<CardTally>
  clearTalliesOnCard: () => void
}

const PollWorkerScreen: React.FC<Props> = ({
  activateCardlessBallotStyleId,
  resetCardlessBallot,
  appPrecinctId,
  ballotsPrintedCount,
  ballotStyleId,
  electionDefinition,
  enableLiveMode,
  isLiveMode,
  isPollsOpen,
  machineConfig,
  printer,
  tally,
  togglePollsOpen,
  hasVotes,
  saveTallyToCard,
  talliesOnCard,
  clearTalliesOnCard,
}) => {
  const { election } = electionDefinition
  const electionDate = DateTime.fromISO(electionDefinition.election.date)
  const isElectionDay = electionDate.hasSame(DateTime.now(), 'day')
  const precinct = election.precincts.find(
    (p) => p.id === appPrecinctId
  ) as Precinct
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(appPrecinctId)
  )

  const [isConfirmingPrintReport, setIsConfirmingPrintReport] = useState(false)
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  )
  const cancelEnableLiveMode = () => setIsConfirmingEnableLiveMode(false)
  const [isPrintingReport, setIsPrintingReport] = useState(false)
  const cancelConfirmPrint = () => setIsConfirmingPrintReport(false)
  const isPrintMode = !!machineConfig.appMode.isVxPrint
  const isMarkAndPrintMode =
    machineConfig.appMode.isVxPrint && machineConfig.appMode.isVxMark

  const [isSavingTally, setIsSavingTally] = useState(false)
  const [isConfirmingCombinedPrint, setIsConfirmingCombinedPrint] = useState(
    false
  )
  const [
    isConfirmingPrecinctScannerPrint,
    setIsConfirmingPrecinctScannerPrint,
  ] = useState(false)
  const [isPrintingCombinedReport, setIsPrintingCombinedReport] = useState(
    false
  )
  const [
    isPrintingPrecinctScannerReport,
    setIsPrintingPrecinctScannerReport,
  ] = useState(false)

  const requestPrintSingleMachineReport = () => {
    setIsPrintingReport(true)
    setIsConfirmingPrintReport(false)
  }

  const requestPrintCombinedMachineReport = () => {
    setIsPrintingCombinedReport(true)
    setIsConfirmingCombinedPrint(false)
  }

  const requestPrintPrecinctScannerReport = () => {
    setIsPrintingPrecinctScannerReport(true)
    setIsConfirmingPrecinctScannerPrint(false)
  }

  const resetCardTallyData = useCallback(async () => {
    await clearTalliesOnCard()
    setIsPrintingCombinedReport(false)
    setIsPrintingPrecinctScannerReport(false)
  }, [clearTalliesOnCard, setIsPrintingCombinedReport])

  const togglePolls = () => {
    if (isPrintMode) {
      setIsConfirmingPrintReport(true)
    } else {
      togglePollsOpen()
    }
  }

  const confirmEnableLiveMode = () => {
    enableLiveMode()
    setIsConfirmingEnableLiveMode(false)
  }

  useEffect(() => {
    let isPrinting = false
    async function printReport() {
      if (
        !isPrinting &&
        (isPrintingReport ||
          isPrintingCombinedReport ||
          isPrintingPrecinctScannerReport)
      ) {
        await printer.print({ sides: 'one-sided' })
        window.setTimeout(() => {
          if (isPrintingReport) {
            togglePollsOpen()
            setIsPrintingReport(false)
          }
          if (isPrintingCombinedReport || isPrintingPrecinctScannerReport) {
            resetCardTallyData()
          }
        }, REPORT_PRINTING_TIMEOUT_SECONDS * 1000)
      }
    }
    printReport()
    return () => {
      isPrinting = true
    }
  }, [
    isPrintingReport,
    isPrintingCombinedReport,
    isPrintingPrecinctScannerReport,
    printer,
    togglePollsOpen,
    resetCardTallyData,
  ])

  const currentDateTime = new Date().toLocaleString()
  const reportPurposes = ['Publicly Posted', 'Officially Filed']

  if (hasVotes) {
    return (
      <Screen>
        <Main>
          <MainChild center narrow>
            <Prose textCenter>
              <h1 aria-label="Ballot style {ballotStyleId} has been  activated.">
                Ballot Contains Votes
              </h1>
              <p>
                Remove card to allow voter to continue voting, or reset ballot.
              </p>
              <p>
                <Button danger onPress={resetCardlessBallot}>
                  Reset Ballot
                </Button>
              </p>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  if (ballotStyleId) {
    return (
      <Screen>
        <Main>
          <MainChild center narrow>
            <Prose>
              <h1
                aria-label={`Ballot style ${ballotStyleId} has been activated.`}
              >
                Ballot style {ballotStyleId} has been activated.
              </h1>
              <ol>
                <li>Remove the poll worker card.</li>
                <li>
                  Instruct the voter to press the{' '}
                  <Text as="span" bold noWrap>
                    Start Voting
                  </Text>{' '}
                  button.
                </li>
              </ol>
              <HorizontalRule>or</HorizontalRule>
              <Text center>
                Deactivate this ballot style to select another ballot style.
              </Text>
              <Text center>
                <Button small onPress={resetCardlessBallot}>
                  Deactivate Ballot Style {ballotStyleId}
                </Button>
              </Text>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  const isTallyOnCardFromPrecinctScanner =
    talliesOnCard &&
    talliesOnCard.tallyMachineType === TallySourceMachineType.PRECINCT_SCANNER

  const bmdTalliesOnCard =
    talliesOnCard?.tallyMachineType === TallySourceMachineType.BMD
      ? (talliesOnCard as BMDCardTally)
      : undefined

  const isMachineTallySaved =
    bmdTalliesOnCard &&
    bmdTalliesOnCard.tallyMachineType === TallySourceMachineType.BMD &&
    !!bmdTalliesOnCard.metadata.find(
      (metadata) => metadata.machineId === machineConfig.machineId
    )

  const combinedTally =
    bmdTalliesOnCard === undefined
      ? tally
      : isMachineTallySaved
      ? bmdTalliesOnCard.tally
      : combineTallies(election, bmdTalliesOnCard.tally, tally)

  const combinedBallotsPrinted =
    bmdTalliesOnCard === undefined
      ? ballotsPrintedCount
      : isMachineTallySaved
      ? bmdTalliesOnCard.totalBallotsPrinted
      : bmdTalliesOnCard.totalBallotsPrinted + ballotsPrintedCount

  const handleSavingTally = async () => {
    setIsSavingTally(true)
    const metadata = bmdTalliesOnCard?.metadata.slice() ?? []
    metadata.push({
      machineId: machineConfig.machineId,
      timeSaved: Date.now(),
      ballotCount: ballotsPrintedCount,
    })
    await saveTallyToCard({
      tallyMachineType: TallySourceMachineType.BMD,
      tally: combinedTally,
      metadata,
      totalBallotsPrinted: combinedBallotsPrinted,
    } as BMDCardTally)
    setIsSavingTally(false)
  }
  const metadataRows: React.ReactChild[] = []
  const machineMetadata = talliesOnCard?.metadata.slice() ?? []
  if (!isMachineTallySaved) {
    metadataRows.push(
      <tr key={machineConfig.machineId} data-testid="tally-machine-row">
        <td>
          {machineConfig.machineId}
          {' (current machine)'}
        </td>
        <td>
          <Button small onPress={handleSavingTally}>
            Save to Card
          </Button>
        </td>
      </tr>
    )
    machineMetadata.push({
      machineId: machineConfig.machineId,
      timeSaved: Date.now(),
      ballotCount: ballotsPrintedCount,
    })
  }
  if (bmdTalliesOnCard !== undefined) {
    metadataRows.push(
      ...bmdTalliesOnCard.metadata
        .slice()
        .sort((a, b) => b.timeSaved - a.timeSaved)
        .map((m) => {
          const isCurrentMachine = m.machineId === machineConfig.machineId
          return (
            <tr key={m.machineId} data-testid="tally-machine-row">
              <td>
                {m.machineId}
                {isCurrentMachine && ' (current machine)'}
              </td>
              <td>
                {formatFullDateTimeZone(DateTime.fromMillis(m.timeSaved))}
              </td>
            </tr>
          )
        })
    )
  }

  return (
    <React.Fragment>
      <Screen flexDirection="row-reverse" voterMode={false}>
        <Main padded>
          <MainChild>
            {isMarkAndPrintMode && isPollsOpen && (
              <React.Fragment>
                <Prose>
                  <h1>Activate Ballot Style</h1>
                </Prose>
                <ButtonList data-testid="precincts">
                  {precinctBallotStyles.map((bs) => (
                    <Button
                      fullWidth
                      key={bs.id}
                      onPress={() => activateCardlessBallotStyleId(bs.id)}
                    >
                      {bs.id}
                    </Button>
                  ))}
                </ButtonList>
              </React.Fragment>
            )}
            <Prose>
              <h1>Open/Close Polls</h1>
              <Text warningIcon={!isPollsOpen} voteIcon={isPollsOpen}>
                {isPollsOpen
                  ? 'Polls are currently open.'
                  : 'Polls are currently closed.'}{' '}
                {isLiveMode ? (
                  <React.Fragment>
                    Machine is in Live&nbsp;Election&nbsp;Mode.
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    Machine is in Testing&nbsp;Mode.
                  </React.Fragment>
                )}
              </Text>
              {isPrintMode && (
                <p>
                  When opening and closing polls,{' '}
                  {pluralize('report', reportPurposes.length, true)} will be
                  printed.
                </p>
              )}
              <p>
                <Button large onPress={togglePolls}>
                  {isPollsOpen
                    ? `Close Polls for ${precinct.name}`
                    : `Open Polls for ${precinct.name}`}
                </Button>
              </p>
              {isPrintMode && isTallyOnCardFromPrecinctScanner && (
                <Prose>
                  <h1> Results Reports </h1>
                  <Button
                    onPress={() => setIsConfirmingPrecinctScannerPrint(true)}
                  >
                    Print Precinct Scanner Tally Report
                  </Button>
                </Prose>
              )}
              {!isPollsOpen &&
                isPrintMode &&
                !isTallyOnCardFromPrecinctScanner && (
                  <Prose>
                    <h1>Combine Results Reports</h1>
                    <p>
                      Combine results from multiple machines in order to print a
                      single consolidated results report.
                    </p>
                    <Table>
                      <tbody>
                        <tr>
                          <th>Machine ID</th>
                          <th>Saved on Card At</th>
                        </tr>
                        {metadataRows}
                      </tbody>
                    </Table>
                    <p>
                      <Button
                        onPress={() => setIsConfirmingCombinedPrint(true)}
                      >
                        Print Combined Report for{' '}
                        {pluralize('Machine', metadataRows.length, true)}
                      </Button>
                    </p>
                  </Prose>
                )}
            </Prose>
          </MainChild>
        </Main>
        <Sidebar
          appName={machineConfig.appMode.name}
          centerContent
          title="Poll Worker Actions"
          footer={
            <React.Fragment>
              <ElectionInfo
                electionDefinition={electionDefinition}
                precinctId={appPrecinctId}
                horizontal
              />
              <VersionsData
                machineConfig={machineConfig}
                electionHash={electionDefinition.electionHash}
              />
            </React.Fragment>
          }
        >
          <Prose>
            <Text center>Remove card when finished.</Text>
          </Prose>
        </Sidebar>
        {isConfirmingPrintReport && (
          <Modal
            centerContent
            content={
              <Prose textCenter>
                <p>
                  {isPollsOpen
                    ? 'Close Polls and print Polls Closed report?'
                    : 'Open polls and print Polls Opened report?'}
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button primary onPress={requestPrintSingleMachineReport}>
                  Yes
                </Button>
                <Button onPress={cancelConfirmPrint}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {isPrintingReport && (
          <Modal
            centerContent
            content={
              <Prose textCenter>
                <Loading as="p">
                  {isPollsOpen
                    ? `Printing Polls Closed report for ${precinct.name}`
                    : `Printing Polls Opened report for ${precinct.name}`}
                </Loading>
              </Prose>
            }
          />
        )}
        {isConfirmingEnableLiveMode && (
          <Modal
            centerContent
            content={
              <Prose textCenter>
                {isPrintMode ? (
                  <h1>
                    Switch to Live&nbsp;Election&nbsp;Mode and reset the tally
                    of printed ballots?
                  </h1>
                ) : (
                  <h1>Switch to Live&nbsp;Election&nbsp;Mode?</h1>
                )}
                <p>
                  Today is Election Day and this machine is in{' '}
                  <strong>Testing&nbsp;Mode.</strong>
                </p>
                <p>
                  <em>
                    Note: Switching back to Testing&nbsp;Mode requires an
                    Admin&nbsp;Card.
                  </em>
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button
                  primary
                  danger={isPrintMode}
                  onPress={confirmEnableLiveMode}
                >
                  Switch to Live&nbsp;Mode
                </Button>
                <Button onPress={cancelEnableLiveMode}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {isSavingTally && <Modal content={<Loading>Saving to card</Loading>} />}
        {isPrintingCombinedReport && (
          <Modal content={<Loading>Printing combined report</Loading>} />
        )}
        {isPrintingPrecinctScannerReport && (
          <Modal
            content={<Loading>Printing precinct scanner report</Loading>}
          />
        )}
        {isConfirmingCombinedPrint && (
          <Modal
            content={
              <Prose>
                <p>
                  Do you want to print the combined results report from the{' '}
                  {pluralize('machine', machineMetadata.length, true)} (
                  {machineMetadata.map((m) => m.machineId).join(', ')}) and
                  clear tally data from the card?
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button primary onPress={requestPrintCombinedMachineReport}>
                  Print Report
                </Button>
                <Button onPress={() => setIsConfirmingCombinedPrint(false)}>
                  Close
                </Button>
              </React.Fragment>
            }
          />
        )}
        {isConfirmingPrecinctScannerPrint && (
          <Modal
            content={
              <Prose>
                <p>
                  Do you want to print the precinct scanner results report and
                  clear tally data from the card?
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button primary onPress={requestPrintPrecinctScannerReport}>
                  Print Report
                </Button>
                <Button
                  onPress={() => setIsConfirmingPrecinctScannerPrint(false)}
                >
                  Close
                </Button>
              </React.Fragment>
            }
          />
        )}
      </Screen>
      {isPrintMode &&
        reportPurposes.map((reportPurpose) => {
          if (isPrintingPrecinctScannerReport && talliesOnCard) {
            return (
              <React.Fragment key={reportPurpose}>
                <PollsReport
                  key={`polls-report-${reportPurpose}`}
                  sourceMachineType={TallySourceMachineType.PRECINCT_SCANNER}
                  appName="Precinct Scanner"
                  ballotCount={
                    (talliesOnCard as PrecinctScannerCardTally)
                      .totalBallotsScanned
                  }
                  currentDateTime={currentDateTime}
                  election={election}
                  isLiveMode={
                    (talliesOnCard as PrecinctScannerCardTally).isLiveMode
                  }
                  isPollsOpen={
                    (talliesOnCard as PrecinctScannerCardTally).isPollsOpen
                  }
                  machineMetadata={talliesOnCard?.metadata}
                  machineConfig={machineConfig} // not used
                  precinctId={appPrecinctId}
                  reportPurpose={reportPurpose}
                />
                <PrecinctTallyReport
                  key={`tally-report-${reportPurpose}`}
                  sourceMachineType={TallySourceMachineType.PRECINCT_SCANNER}
                  ballotCount={
                    (talliesOnCard as PrecinctScannerCardTally)
                      .totalBallotsScanned
                  }
                  currentDateTime={currentDateTime}
                  election={election}
                  isPollsOpen={
                    (talliesOnCard as PrecinctScannerCardTally).isPollsOpen
                  }
                  tally={talliesOnCard!.tally}
                  precinctId={appPrecinctId}
                  reportPurpose={reportPurpose}
                />
              </React.Fragment>
            )
          }
          if (isPrintingCombinedReport) {
            return (
              <React.Fragment key={reportPurpose}>
                <PollsReport
                  key={`polls-report-${reportPurpose}`}
                  sourceMachineType={TallySourceMachineType.BMD}
                  appName={machineConfig.appMode.name}
                  ballotCount={combinedBallotsPrinted}
                  currentDateTime={currentDateTime}
                  election={election}
                  isLiveMode={isLiveMode}
                  isPollsOpen={false}
                  machineMetadata={machineMetadata}
                  machineConfig={machineConfig}
                  precinctId={appPrecinctId}
                  reportPurpose={reportPurpose}
                />
                <PrecinctTallyReport
                  key={`tally-report-${reportPurpose}`}
                  sourceMachineType={TallySourceMachineType.BMD}
                  ballotCount={combinedBallotsPrinted}
                  currentDateTime={currentDateTime}
                  election={election}
                  isPollsOpen={false}
                  tally={combinedTally}
                  precinctId={appPrecinctId}
                  reportPurpose={reportPurpose}
                />
              </React.Fragment>
            )
          }
          // Basic current machine report
          return (
            <React.Fragment key={reportPurpose}>
              <PollsReport
                key={`polls-report-${reportPurpose}`}
                sourceMachineType={TallySourceMachineType.BMD}
                appName={machineConfig.appMode.name}
                ballotCount={ballotsPrintedCount}
                currentDateTime={currentDateTime}
                election={election}
                isLiveMode={isLiveMode}
                isPollsOpen={!isPollsOpen} // This report is printed just before the value of isPollsOpen is updated when opening/closing polls, so we want to print the report with the toggled value.
                machineMetadata={undefined}
                machineConfig={machineConfig}
                precinctId={appPrecinctId}
                reportPurpose={reportPurpose}
              />
              <PrecinctTallyReport
                key={`tally-report-${reportPurpose}`}
                sourceMachineType={TallySourceMachineType.BMD}
                ballotCount={ballotsPrintedCount}
                currentDateTime={currentDateTime}
                election={election}
                isPollsOpen={!isPollsOpen}
                tally={tally}
                precinctId={appPrecinctId}
                reportPurpose={reportPurpose}
              />
            </React.Fragment>
          )
        })}
    </React.Fragment>
  )
}

export default PollWorkerScreen
