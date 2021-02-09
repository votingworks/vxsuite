import React, { useState, useEffect } from 'react'
import pluralize from 'pluralize'
import { Precinct, ElectionDefinition } from '@votingworks/types'

import { Tally, MachineConfig } from '../config/types'

import Button from '../components/Button'
import ButtonList from '../components/ButtonList'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import { Printer } from '../utils/printer'
import { isSameDay } from '../utils/date'
import PollsReport from '../components/PollsReport'
import PrecinctTallyReport from '../components/PrecinctTallyReport'
import Loading from '../components/Loading'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals'
import HorizontalRule from '../components/HorizontalRule'

interface Props {
  activateCardlessBallotStyleId: (id: string) => void
  appPrecinctId: string
  ballotsPrintedCount: number
  ballotStyleId: string
  electionDefinition: ElectionDefinition
  enableLiveMode: () => void
  hasVotes: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  machineConfig: MachineConfig
  printer: Printer
  tally: Tally
  togglePollsOpen: () => void
}

const PollWorkerScreen: React.FC<Props> = ({
  activateCardlessBallotStyleId,
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
}) => {
  const { election } = electionDefinition
  const electionDate = new Date(electionDefinition.election.date)
  const isElectionDay = isSameDay(electionDate, new Date())
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

  const requestPrintReport = () => {
    setIsPrintingReport(true)
    setIsConfirmingPrintReport(false)
  }

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
      if (!isPrinting && isPrintingReport) {
        await printer.print()
        window.setTimeout(() => {
          togglePollsOpen()
          setIsPrintingReport(false)
        }, REPORT_PRINTING_TIMEOUT_SECONDS * 1000)
      }
    }
    printReport()
    return () => {
      isPrinting = true
    }
  }, [isPrintingReport, printer, togglePollsOpen])

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
                <Button
                  danger
                  onPress={() => {
                    activateCardlessBallotStyleId('')
                  }}
                >
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
              <h1 aria-label="Ballot style {ballotStyleId} has been  activated.">
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
                <Button
                  small
                  onPress={() => {
                    activateCardlessBallotStyleId('')
                  }}
                >
                  Deactivate Ballot Style {ballotStyleId}
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
                <Button big onPress={togglePolls}>
                  {isPollsOpen
                    ? `Close Polls for ${precinct.name}`
                    : `Open Polls for ${precinct.name}`}
                </Button>
              </p>
            </Prose>
          </MainChild>
        </Main>
        <Sidebar
          appName={machineConfig.appMode.name}
          centerContent
          title="Poll Worker Actions"
          footer={
            <ElectionInfo
              electionDefinition={electionDefinition}
              precinctId={appPrecinctId}
              showElectionHash
              horizontal
            />
          }
        >
          <Prose>
            <Text center>Remove card when finished.</Text>
          </Prose>
        </Sidebar>
        <Modal
          isOpen={isConfirmingPrintReport}
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
              <Button primary onPress={requestPrintReport}>
                Yes
              </Button>
              <Button onPress={cancelConfirmPrint}>Cancel</Button>
            </React.Fragment>
          }
        />
        <Modal
          isOpen={isPrintingReport}
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
        <Modal
          isOpen={isConfirmingEnableLiveMode}
          centerContent
          content={
            <Prose textCenter>
              {isPrintMode ? (
                <h1>
                  Switch to Live&nbsp;Election&nbsp;Mode and reset the tally of
                  printed ballots?
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
      </Screen>
      {isPrintMode &&
        reportPurposes.map((reportPurpose) => (
          <React.Fragment key={reportPurpose}>
            <PollsReport
              key={`polls-report-${reportPurpose}`}
              appName={machineConfig.appMode.name}
              ballotsPrintedCount={ballotsPrintedCount}
              currentDateTime={currentDateTime}
              election={election}
              isLiveMode={isLiveMode}
              isPollsOpen={isPollsOpen}
              machineConfig={machineConfig}
              precinctId={appPrecinctId}
              reportPurpose={reportPurpose}
            />
            <PrecinctTallyReport
              key={`tally-report-${reportPurpose}`}
              ballotsPrintedCount={ballotsPrintedCount}
              currentDateTime={currentDateTime}
              election={election}
              isPollsOpen={isPollsOpen}
              tally={tally}
              precinctId={appPrecinctId}
              reportPurpose={reportPurpose}
            />
          </React.Fragment>
        ))}
    </React.Fragment>
  )
}

export default PollWorkerScreen
