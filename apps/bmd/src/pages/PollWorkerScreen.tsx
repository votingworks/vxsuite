import React, { useState, useEffect } from 'react'
import pluralize from 'pluralize'
import { Precinct, Election } from '@votingworks/ballot-encoder'

import { Tally, MachineConfig } from '../config/types'

import Button from '../components/Button'
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
  election: Election
  isPollsOpen: boolean
  isLiveMode: boolean
  machineConfig: MachineConfig
  printer: Printer
  tally: Tally
  togglePollsOpen: () => void
}

const PollWorkerScreen = ({
  appPrecinctId,
  ballotsPrintedCount,
  election,
  isPollsOpen,
  isLiveMode,
  machineConfig,
  printer,
  tally,
  togglePollsOpen,
}: Props) => {
  const precinct = election.precincts.find(
    (p) => p.id === appPrecinctId
  ) as Precinct
  const [isConfirmingPrintReport, setIsConfirmingPrintReport] = useState(false)
  const [isPrintingReport, setIsPrintingReport] = useState(false)
  const cancelConfirmPrint = () => setIsConfirmingPrintReport(false)
  const isPrintMode = !!machineConfig.appMode.isVxPrint

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
  return (
    <React.Fragment>
      <Screen flexDirection="row-reverse" voterMode={false}>
        <Main padded>
          <MainChild>
            <Prose>
              <h1>Open/Close Polls</h1>
              <Text warningIcon={!isPollsOpen} voteIcon={isPollsOpen}>
                {isPollsOpen
                  ? 'Polls are currently open.'
                  : 'Polls are currently closed.'}
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
              election={election}
              precinctId={appPrecinctId}
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
