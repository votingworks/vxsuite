import { DateTime } from 'luxon'
import React, { useState, useEffect, useCallback } from 'react'
import pluralize from 'pluralize'

import { ElectionDefinition, Optional } from '@votingworks/types'
import {
  Button,
  ButtonList,
  HorizontalRule,
  Loading,
  Main,
  MainChild,
  NoWrap,
} from '@votingworks/ui'

import {
  formatFullDateTimeZone,
  Tally,
  CardTally,
  TallySourceMachineType,
  find,
} from '@votingworks/utils'

import {
  MachineConfig,
  PrecinctSelection,
  PrecinctSelectionKind,
} from '../config/types'

import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import { Printer } from '../utils/printer'
import PollsReport from '../components/PollsReport'
import PrecinctTallyReport from '../components/PrecinctTallyReport'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals'
import Table from '../components/Table'
import VersionsData from '../components/VersionsData'
import triggerAudioFocus from '../utils/triggerAudioFocus'

interface Props {
  activateCardlessVoterSession: (
    precinctId: string,
    ballotStyleId?: string
  ) => void
  resetCardlessVoterSession: () => void
  appPrecinct: PrecinctSelection
  ballotsPrintedCount: number
  cardlessVoterSessionPrecinctId?: string
  cardlessVoterSessionBallotStyleId?: string
  electionDefinition: ElectionDefinition
  enableLiveMode: () => void
  hasVotes: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  machineConfig: MachineConfig
  printer: Printer
  tally: Tally
  togglePollsOpen: () => void
  saveTallyToCard: (cardTally: CardTally) => Promise<void>
  talliesOnCard: Optional<CardTally>
  clearTalliesOnCard: () => Promise<void>
}

const PollWorkerScreen: React.FC<Props> = ({
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  appPrecinct,
  ballotsPrintedCount,
  cardlessVoterSessionPrecinctId = appPrecinct.kind ===
  PrecinctSelectionKind.SinglePrecinct
    ? appPrecinct.precinctId
    : undefined,
  cardlessVoterSessionBallotStyleId,
  electionDefinition,
  enableLiveMode,
  isLiveMode,
  isPollsOpen,
  machineConfig,
  printer,
  togglePollsOpen,
  hasVotes,
  saveTallyToCard,
  talliesOnCard,
  clearTalliesOnCard,
}) => {
  const { election } = electionDefinition
  const electionDate = DateTime.fromISO(electionDefinition.election.date)
  const isElectionDay = electionDate.hasSame(DateTime.now(), 'day')
  const precinctName =
    appPrecinct.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(election.precincts, (p) => p.id === appPrecinct.precinctId).name

  const precinctBallotStyles = cardlessVoterSessionPrecinctId
    ? election.ballotStyles.filter((bs) =>
        bs.precincts.includes(cardlessVoterSessionPrecinctId)
      )
    : []

  const isTallyOnCardFromPrecinctScanner =
    talliesOnCard?.tallyMachineType === TallySourceMachineType.PRECINCT_SCANNER

  /*
   * Various state parameters to handle controlling when certain modals on the page are open or not.
   * If you are adding a new modal make sure to add the new parameter to the triggerAudiofocus useEffect
   * dependency. This will retrigger the audio to explain landing on the PollWorker homepage
   * when the modal closes.
   */
  const [isConfirmingPrintReport, setIsConfirmingPrintReport] = useState(false)
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  )
  const cancelEnableLiveMode = () => setIsConfirmingEnableLiveMode(false)
  const [isPrintingReport, setIsPrintingReport] = useState(false)
  const cancelConfirmPrint = () => setIsConfirmingPrintReport(false)

  const [isSavingTally, setIsSavingTally] = useState(false)
  const [isConfirmingCombinedPrint, setIsConfirmingCombinedPrint] = useState(
    false
  )
  const [
    isConfirmingPrecinctScannerPrint,
    setIsConfirmingPrecinctScannerPrint,
  ] = useState(isTallyOnCardFromPrecinctScanner)
  const [isPrintingCombinedReport, setIsPrintingCombinedReport] = useState(
    false
  )
  const [
    isPrintingPrecinctScannerReport,
    setIsPrintingPrecinctScannerReport,
  ] = useState(false)

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (
      !isConfirmingPrecinctScannerPrint &&
      !isConfirmingCombinedPrint &&
      !isPrintingPrecinctScannerReport &&
      !isPrintingCombinedReport &&
      !isSavingTally &&
      !isConfirmingEnableLiveMode &&
      !isPrintingReport &&
      !isConfirmingPrintReport
    ) {
      triggerAudioFocus()
    }
  }, [
    cardlessVoterSessionBallotStyleId,
    isConfirmingPrecinctScannerPrint,
    isConfirmingCombinedPrint,
    isPrintingPrecinctScannerReport,
    isPrintingCombinedReport,
    isSavingTally,
    isConfirmingEnableLiveMode,
    isPrintingReport,
    isConfirmingPrintReport,
  ])

  const isPrintMode = machineConfig.appMode.isVxPrint
  const isMarkAndPrintMode =
    machineConfig.appMode.isVxPrint && machineConfig.appMode.isVxMark

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
        window.setTimeout(async () => {
          if (isPrintingReport) {
            togglePollsOpen()
            setIsPrintingReport(false)
          }
          if (isPrintingCombinedReport || isPrintingPrecinctScannerReport) {
            await resetCardTallyData()
          }
        }, REPORT_PRINTING_TIMEOUT_SECONDS * 1000)
      }
    }
    void printReport()
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
                <Button danger onPress={resetCardlessVoterSession}>
                  Reset Ballot
                </Button>
              </p>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  if (cardlessVoterSessionPrecinctId && cardlessVoterSessionBallotStyleId) {
    const activationPrecinctName = find(
      election.precincts,
      (p) => p.id === cardlessVoterSessionPrecinctId
    ).name

    return (
      <Screen>
        <Main>
          <MainChild center narrow>
            <Prose id="audiofocus">
              <h1>
                {appPrecinct.kind === PrecinctSelectionKind.AllPrecincts
                  ? `Voter session activated: ${cardlessVoterSessionBallotStyleId} @ ${activationPrecinctName}`
                  : `Voter session activated: ${cardlessVoterSessionBallotStyleId}`}
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
              <Text center>Deactivate this voter session to start over.</Text>
              <Text center>
                <Button small onPress={resetCardlessVoterSession}>
                  Deactivate Voter Session
                </Button>
              </Text>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  const bmdTalliesOnCard =
    talliesOnCard?.tallyMachineType === TallySourceMachineType.BMD
      ? talliesOnCard
      : undefined

  const isMachineTallySaved =
    bmdTalliesOnCard?.tallyMachineType === TallySourceMachineType.BMD &&
    bmdTalliesOnCard.metadata.some(
      (metadata) => metadata.machineId === machineConfig.machineId
    )

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
      metadata,
      totalBallotsPrinted: combinedBallotsPrinted,
    })
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
          <Button
            small
            onPress={handleSavingTally}
            aria-label="Save current machine tally to card"
          >
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
                  <h1>Activate Voter Session</h1>
                </Prose>
                {appPrecinct.kind === PrecinctSelectionKind.AllPrecincts && (
                  <React.Fragment>
                    <h3>Choose Precinct</h3>
                    <ButtonList data-testid="precincts">
                      {election.precincts.map((precinct) => (
                        <Button
                          fullWidth
                          key={precinct.id}
                          aria-label={`Activate Voter Session for Precinct ${precinct.name}`}
                          onPress={() =>
                            activateCardlessVoterSession(precinct.id)
                          }
                          primary={
                            cardlessVoterSessionPrecinctId === precinct.id
                          }
                        >
                          {precinct.name}
                        </Button>
                      ))}
                    </ButtonList>
                  </React.Fragment>
                )}
                {cardlessVoterSessionPrecinctId && (
                  <React.Fragment>
                    <h3>Choose Ballot Style</h3>
                    <ButtonList data-testid="ballot-styles">
                      {precinctBallotStyles.map((bs) => (
                        <Button
                          fullWidth
                          key={bs.id}
                          aria-label={`Activate Voter Session for Ballot Style ${bs.id}`}
                          onPress={() =>
                            activateCardlessVoterSession(
                              cardlessVoterSessionPrecinctId,
                              bs.id
                            )
                          }
                        >
                          {bs.id}
                        </Button>
                      ))}
                    </ButtonList>
                  </React.Fragment>
                )}
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
                    Machine is in <NoWrap>Live Election Mode</NoWrap>.
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    Machine is in <NoWrap>Testing Mode</NoWrap>.
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
                    ? `Close Polls for ${precinctName}`
                    : `Open Polls for ${precinctName}`}
                </Button>
              </p>
              {!isPollsOpen && isPrintMode && (
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
                    <Button onPress={() => setIsConfirmingCombinedPrint(true)}>
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
          screenReaderInstructions="To navigate through the available actions, use the down arrow."
          footer={
            <React.Fragment>
              <ElectionInfo
                electionDefinition={electionDefinition}
                precinctSelection={appPrecinct}
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
              <Prose textCenter id="modalaudiofocus">
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
              <Prose textCenter id="modalaudiofocus">
                <Loading as="p">
                  {isPollsOpen
                    ? `Printing Polls Closed report for ${precinctName}`
                    : `Printing Polls Opened report for ${precinctName}`}
                </Loading>
              </Prose>
            }
          />
        )}
        {isConfirmingEnableLiveMode && (
          <Modal
            centerContent
            content={
              <Prose textCenter id="modalaudiofocus">
                {isPrintMode ? (
                  <h1>
                    Switch to <NoWrap>Live Election Mode</NoWrap> and reset the
                    tally of printed ballots?
                  </h1>
                ) : (
                  <h1>
                    Switch to <NoWrap>Live Election Mode?</NoWrap>
                  </h1>
                )}
                <p>
                  Today is Election Day and this machine is in{' '}
                  <NoWrap as="strong">Testing Mode.</NoWrap>
                </p>
                <p>
                  <em>
                    Note: Switching back to <NoWrap>Testing Mode</NoWrap>{' '}
                    requires an
                    <NoWrap>Admin Card</NoWrap>.
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
                  Switch to <NoWrap>Live Mode</NoWrap>
                </Button>
                <Button onPress={cancelEnableLiveMode}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {isSavingTally && (
          <Modal
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading>Saving to card</Loading>
              </Prose>
            }
          />
        )}
        {isPrintingCombinedReport && (
          <Modal
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading>Printing combined report</Loading>
              </Prose>
            }
          />
        )}
        {isPrintingPrecinctScannerReport && (
          <Modal
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading>Printing tally report</Loading>
              </Prose>
            }
          />
        )}
        {isConfirmingCombinedPrint && (
          <Modal
            content={
              <Prose id="modalaudiofocus">
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
              <Prose id="modalaudiofocus">
                <h1>Tally Report on Card</h1>
                <p>
                  This poll worker card contains a tally report. The report will
                  be cleared from the card after being printed.
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button primary onPress={requestPrintPrecinctScannerReport}>
                  Print Tally Report
                </Button>
              </React.Fragment>
            }
          />
        )}
      </Screen>
      {isPrintMode &&
        reportPurposes.map((reportPurpose) => {
          if (
            isPrintingPrecinctScannerReport &&
            talliesOnCard?.tallyMachineType ===
              TallySourceMachineType.PRECINCT_SCANNER
          ) {
            return (
              <React.Fragment key={reportPurpose}>
                <PollsReport
                  key={`polls-report-${reportPurpose}`}
                  sourceMachineType={talliesOnCard.tallyMachineType}
                  appName="Precinct Scanner"
                  ballotCount={talliesOnCard.totalBallotsScanned}
                  currentDateTime={currentDateTime}
                  election={election}
                  isLiveMode={talliesOnCard.isLiveMode}
                  isPollsOpen={talliesOnCard.isPollsOpen}
                  machineMetadata={talliesOnCard?.metadata}
                  machineConfig={machineConfig} // not used
                  precinctSelection={appPrecinct}
                  reportPurpose={reportPurpose}
                />
                <PrecinctTallyReport
                  key={`tally-report-${reportPurpose}`}
                  sourceMachineType={talliesOnCard.tallyMachineType}
                  ballotCount={talliesOnCard.totalBallotsScanned}
                  currentDateTime={currentDateTime}
                  election={election}
                  isPollsOpen={talliesOnCard.isPollsOpen}
                  tally={talliesOnCard!.tally}
                  precinctSelection={appPrecinct}
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
                  precinctSelection={appPrecinct}
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
                precinctSelection={appPrecinct}
                reportPurpose={reportPurpose}
              />
            </React.Fragment>
          )
        })}
    </React.Fragment>
  )
}

export default PollWorkerScreen
