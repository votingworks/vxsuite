import React, { useState } from 'react'
import pluralize from 'pluralize'
import { Precinct, Election } from '@votingworks/ballot-encoder'

import { AppMode, Tally } from '../config/types'

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

interface Props {
  appMode: AppMode
  appPrecinctId: string
  ballotsPrintedCount: number
  election: Election
  isPollsOpen: boolean
  isLiveMode: boolean
  machineId: string
  printer: Printer
  tally: Tally
  togglePollsOpen: () => void
}

const PollWorkerScreen = ({
  appMode,
  appPrecinctId,
  ballotsPrintedCount,
  election,
  isPollsOpen,
  isLiveMode,
  machineId,
  printer,
  tally,
  togglePollsOpen,
}: Props) => {
  const precinct = election.precincts.find(
    p => p.id === appPrecinctId
  ) as Precinct
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
                <Button big onPress={toggle}>
                  {isPollsOpen ? 'Close Polls' : 'Open Polls'} for{' '}
                  {precinct.name}
                </Button>
              </p>
            </Prose>
          </MainChild>
        </Main>
        <Sidebar
          appName={appMode.name}
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
        reportPurposes.map(reportPurpose => (
          <React.Fragment key={reportPurpose}>
            <PollsReport
              key={`polls-report-${reportPurpose}`}
              appName={appMode.name}
              ballotsPrintedCount={ballotsPrintedCount}
              currentDateTime={currentDateTime}
              election={election}
              isLiveMode={isLiveMode}
              isPollsOpen={isPollsOpen}
              machineId={machineId}
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
