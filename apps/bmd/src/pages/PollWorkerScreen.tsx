import React, { useState } from 'react'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Modal from '../components/Modal'
import Prose from '../components/Prose'

interface Props {
  ballotsPrintedCount: number
  isPollsOpen: boolean
  isLiveMode: boolean
  togglePollsOpen: () => void
}

const ClerkScreen = ({
  ballotsPrintedCount,
  isPollsOpen,
  isLiveMode,
  togglePollsOpen,
}: Props) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const showModal = () => setIsModalOpen(true)
  const hideModal = () => setIsModalOpen(false)
  const printStatus = () => {
    window.print()
    togglePollsOpen()
    hideModal()
  }
  const currentDateTime = new Date().toLocaleString()
  return (
    <React.Fragment>
      <Main>
        <MainChild>
          <Prose className="no-print">
            <p>Remove card when finished making changes.</p>
            <h2>Open/Close Polls</h2>
            <p>A summary will be printed when toggling open/closed.</p>
            <p>
              <Button onClick={showModal}>
                {isPollsOpen ? 'Close Polls' : 'Open Polls'}
              </Button>
            </p>
          </Prose>
          <Prose className="print-only">
            <h1>
              {isPollsOpen
                ? `${isLiveMode && 'Unofficial TEST'} Polls Closed Report`
                : `${isLiveMode && 'Unofficial TEST'} Polls Opened Report`}
            </h1>
            <p>
              {isPollsOpen
                ? `Closed at ${currentDateTime}`
                : `Opened at ${currentDateTime}`}
            </p>
            <p>Machine id: ________________________</p>
            <p>
              Ballots printed: <strong>{ballotsPrintedCount}</strong>
            </p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav title="Poll Worker" />
      <Modal
        isOpen={isModalOpen}
        centerContent
        content={
          <Prose textCenter>
            <p>
              {isPollsOpen
                ? 'Close Polls and print report?'
                : 'Open polls and print report?'}
            </p>
          </Prose>
        }
        actions={
          <>
            <Button primary onClick={printStatus}>
              Yes
            </Button>
            <Button onClick={hideModal}>Cancel</Button>
          </>
        }
      />
    </React.Fragment>
  )
}

export default ClerkScreen
