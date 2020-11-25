import React, { PointerEventHandler, useState, useEffect } from 'react'
import pluralize from 'pluralize'
import { Precinct, ElectionDefinition } from '@votingworks/ballot-encoder'

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
import PollsReport from '../components/PollsReport'
import PrecinctTallyReport from '../components/PrecinctTallyReport'
import Loading from '../components/Loading'
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals'

interface Props {
  appPrecinctId: string
  ballotsPrintedCount: number
  electionDefinition: ElectionDefinition
  isPollsOpen: boolean
  isLiveMode: boolean
  isElectionDay: boolean
  machineConfig: MachineConfig
  printer: Printer
  tally: Tally
  togglePollsOpen: () => void
  enableLiveMode: () => void
  cardlessActivatedBallotStyleId: string
  activateBallotStyle: (arg0: string) => void
}

const PollWorkerScreen = ({
  appPrecinctId,
  ballotsPrintedCount,
  electionDefinition,
  isPollsOpen,
  isLiveMode,
  isElectionDay,
  machineConfig,
  printer,
  tally,
  togglePollsOpen,
  enableLiveMode,
  cardlessActivatedBallotStyleId,
  activateBallotStyle,
}: Props) => {
  const { election } = electionDefinition
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
  const isMarkAndPrint =
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

  const selectBallotStyle: PointerEventHandler = (event) => {
    const { id = '' } = (event.target as HTMLElement).dataset
    activateBallotStyle(id)
  }

  if (cardlessActivatedBallotStyleId) {
    return (
      <React.Fragment>
        <Screen>
          <Main>
            <MainChild centerVertical maxWidth={false}>
              <Prose textCenter>
                <h1 aria-label="Ballot Style Activated">
                  Ballot Style {cardlessActivatedBallotStyleId} Activated
                </h1>
                <p>Remove poll worker card and let the voter vote.</p>
                <Button
                  onPress={() => {
                    activateBallotStyle('')
                  }}
                >
                  Cancel
                </Button>
              </Prose>
            </MainChild>
          </Main>
        </Screen>
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <Screen flexDirection="row-reverse" voterMode={false}>
        <Main padded>
          <MainChild>
            <Prose>
              {isMarkAndPrint && (
                <React.Fragment>
                  <h1>Activate Ballot</h1>
                  <ButtonList data-testid="precincts">
                    {precinctBallotStyles.map((bs) => (
                      <Button
                        data-id={bs.id}
                        fullWidth
                        key={bs.id}
                        onPress={selectBallotStyle}
                      >
                        {bs.id}
                      </Button>
                    ))}
                  </ButtonList>
                </React.Fragment>
              )}
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
