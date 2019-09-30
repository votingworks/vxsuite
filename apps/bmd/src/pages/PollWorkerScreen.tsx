import React, { useState } from 'react'
import pluralize from 'pluralize'

import { AppMode, Election } from '../config/types'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import { NullPrinter } from '../utils/printer'
import PollsReport from '../components/PollsReport'

interface Props {
  appMode: AppMode
  ballotsPrintedCount: number
  election: Election
  isPollsOpen: boolean
  isLiveMode: boolean
  machineId: string
  printer: NullPrinter
  togglePollsOpen: () => void
}

const PollWorkerScreen = ({
  appMode,
  ballotsPrintedCount,
  election,
  isPollsOpen,
  isLiveMode,
  machineId,
  printer,
  togglePollsOpen,
}: Props) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const showModal = () => setIsModalOpen(true)
  const hideModal = () => setIsModalOpen(false)
  const isPrintMode = !!appMode.isVxPrint

  const printReport = async () => {
    await printer.print()
    togglePollsOpen()
    hideModal()
  }

  const toggle = () => {
    if (isPrintMode) {
      showModal()
    } else {
      togglePollsOpen()
    }
  }

  const currentDateTime = new Date().toLocaleString()
  const reportIds = [1, 2, 3]
  return (
    <React.Fragment>
      <Screen flexDirection="row-reverse" voterMode={false}>
        <Main padded>
          <MainChild>
            <Prose>
              <p>Remove card when finished making changes.</p>
              <h1>Open/Close Polls</h1>
              <Text warningIcon={!isPollsOpen} voteIcon={isPollsOpen}>
                {isPollsOpen
                  ? 'Polls are currently open.'
                  : 'Polls are currently closed.'}
              </Text>
              {isPrintMode && (
                <p>
                  When opening and closing polls,{' '}
                  {pluralize('report', reportIds.length, true)} will be printed.
                </p>
              )}
              <p>
                <Button onPress={toggle}>
                  {isPollsOpen ? 'Close Polls' : 'Open Polls'}
                </Button>
              </p>
            </Prose>
          </MainChild>
        </Main>
        <Sidebar
          appName={appMode.name}
          title="Poll Worker Actions"
          footer={<ElectionInfo election={election} horizontal />}
        />
        <Modal
          isOpen={isModalOpen}
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
              <Button primary onPress={printReport}>
                Yes
              </Button>
              <Button onPress={hideModal}>Cancel</Button>
            </React.Fragment>
          }
        />
      </Screen>
      {isPrintMode &&
        reportIds.map(reportId => (
          <PollsReport
            key={reportId}
            ballotsPrintedCount={ballotsPrintedCount}
            currentDateTime={currentDateTime}
            election={election}
            isLiveMode={isLiveMode}
            isPollsOpen={isPollsOpen}
            machineId={machineId}
            reportId={reportId}
            reportsLength={reportIds.length}
          />
        ))}
    </React.Fragment>
  )
}

export default PollWorkerScreen
