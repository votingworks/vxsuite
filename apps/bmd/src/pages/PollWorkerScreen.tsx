import { DateTime } from 'luxon'
import React, { useState, useEffect, useCallback } from 'react'

import {
  ElectionDefinition,
  Optional,
  Tally,
  VotingMethod,
} from '@votingworks/types'
import {
  Button,
  ButtonList,
  HorizontalRule,
  Loading,
  Main,
  MainChild,
  PrecinctScannerTallyReport,
  PrecinctScannerPollsReport,
} from '@votingworks/ui'

import {
  CardTally,
  TallySourceMachineType,
  find,
  readSerializedTally,
} from '@votingworks/utils'

import { strict as assert } from 'assert'
import {
  MachineConfig,
  PrecinctSelection,
  PrecinctSelectionKind,
  Printer,
} from '../config/types'

import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals'
import VersionsData from '../components/VersionsData'
import triggerAudioFocus from '../utils/triggerAudioFocus'

interface Props {
  activateCardlessVoterSession: (
    precinctId: string,
    ballotStyleId?: string
  ) => void
  resetCardlessVoterSession: () => void
  appPrecinct: PrecinctSelection
  cardlessVoterSessionPrecinctId?: string
  cardlessVoterSessionBallotStyleId?: string
  electionDefinition: ElectionDefinition
  enableLiveMode: () => void
  hasVotes: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  machineConfig: MachineConfig
  printer: Printer
  togglePollsOpen: () => void
  talliesOnCard: Optional<CardTally>
  clearTalliesOnCard: () => Promise<void>
}

const PollWorkerScreen = ({
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  appPrecinct,

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
  talliesOnCard,
  clearTalliesOnCard,
}: Props): JSX.Element => {
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
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  )
  const cancelEnableLiveMode = () => setIsConfirmingEnableLiveMode(false)

  const [
    isConfirmingPrecinctScannerPrint,
    setIsConfirmingPrecinctScannerPrint,
  ] = useState(isTallyOnCardFromPrecinctScanner)
  const [
    isPrintingPrecinctScannerReport,
    setIsPrintingPrecinctScannerReport,
  ] = useState(false)

  const [precinctScannerTally, setPrecinctScannerTally] = useState<Tally>()

  useEffect(() => {
    if (isTallyOnCardFromPrecinctScanner) {
      assert(
        talliesOnCard &&
          talliesOnCard.tallyMachineType ===
            TallySourceMachineType.PRECINCT_SCANNER
      )
      const serializedTally = talliesOnCard.tally
      const fullTally = readSerializedTally(
        election,
        serializedTally,
        talliesOnCard.totalBallotsScanned,
        {
          [VotingMethod.Precinct]: talliesOnCard.precinctBallots,
          [VotingMethod.Absentee]: talliesOnCard.absenteeBallots,
        }
      )
      setPrecinctScannerTally(fullTally)
    }
  }, [election, talliesOnCard, isTallyOnCardFromPrecinctScanner])

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (
      !isConfirmingPrecinctScannerPrint &&
      !isPrintingPrecinctScannerReport &&
      !isConfirmingEnableLiveMode
    ) {
      triggerAudioFocus()
    }
  }, [
    cardlessVoterSessionBallotStyleId,
    isConfirmingPrecinctScannerPrint,
    isPrintingPrecinctScannerReport,
    isConfirmingEnableLiveMode,
  ])

  const isPrintMode = machineConfig.appMode.isVxPrint
  const isMarkAndPrintMode =
    machineConfig.appMode.isVxPrint && machineConfig.appMode.isVxMark

  const requestPrintPrecinctScannerReport = () => {
    setIsPrintingPrecinctScannerReport(true)
    setIsConfirmingPrecinctScannerPrint(false)
  }

  const resetCardTallyData = useCallback(async () => {
    await clearTalliesOnCard()
    setIsPrintingPrecinctScannerReport(false)
  }, [clearTalliesOnCard])

  const confirmEnableLiveMode = () => {
    enableLiveMode()
    setIsConfirmingEnableLiveMode(false)
  }

  useEffect(() => {
    let isPrinting = false
    async function printReport() {
      if (!isPrinting && isPrintingPrecinctScannerReport) {
        await printer.print({ sides: 'one-sided' })
        window.setTimeout(async () => {
          await resetCardTallyData()
        }, REPORT_PRINTING_TIMEOUT_SECONDS * 1000)
      }
    }
    void printReport()
    return () => {
      isPrinting = true
    }
  }, [
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
                    Machine is in Live&nbsp;Election&nbsp;Mode.
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    Machine is in Testing&nbsp;Mode.
                  </React.Fragment>
                )}
              </Text>
              <p>
                <Button large onPress={togglePollsOpen}>
                  {isPollsOpen
                    ? `Close Polls for ${precinctName}`
                    : `Open Polls for ${precinctName}`}
                </Button>
              </p>
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
        {isConfirmingEnableLiveMode && (
          <Modal
            centerContent
            content={
              <Prose textCenter id="modalaudiofocus">
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
        {isPrintingPrecinctScannerReport && (
          <Modal
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading>Printing tally report</Loading>
              </Prose>
            }
          />
        )}
        {isConfirmingPrecinctScannerPrint && !precinctScannerTally && (
          <Modal
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading />
              </Prose>
            }
          />
        )}
        {isConfirmingPrecinctScannerPrint && precinctScannerTally && (
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
      {talliesOnCard?.tallyMachineType ===
        TallySourceMachineType.PRECINCT_SCANNER &&
        precinctScannerTally &&
        reportPurposes.map((reportPurpose) => {
          return (
            <React.Fragment key={reportPurpose}>
              <PrecinctScannerPollsReport
                key={`polls-report-${reportPurpose}`}
                ballotCount={talliesOnCard.totalBallotsScanned}
                currentDateTime={currentDateTime}
                election={election}
                isLiveMode={talliesOnCard.isLiveMode}
                isPollsOpen={talliesOnCard.isPollsOpen}
                machineMetadata={talliesOnCard.metadata}
                precinctSelection={appPrecinct}
                reportPurpose={reportPurpose}
              />
              <PrecinctScannerTallyReport
                key={`tally-report-${reportPurpose}`}
                currentDateTime={currentDateTime}
                electionDefinition={electionDefinition}
                machineId={talliesOnCard.metadata[0].machineId}
                isPollsOpen={talliesOnCard.isPollsOpen}
                tally={precinctScannerTally}
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
