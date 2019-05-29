import React, { useState } from 'react'

import Button, { SegmentedButton } from '../components/Button'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Modal from '../components/Modal'
import Prose from '../components/Prose'

interface Props {
  ballotsPrintedCount: number
  isPollsOpen: boolean
  togglePollsOpen: () => void
}

const ClerkScreen = ({
  ballotsPrintedCount,
  isPollsOpen,
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
            <h2>Actions</h2>
            <p>A summary will be printed when toggling open/closed.</p>
            <p>
              <SegmentedButton>
                <Button
                  onClick={showModal}
                  primary={!isPollsOpen}
                  disabled={!isPollsOpen}
                >
                  Polls Closed
                </Button>
                <Button
                  onClick={showModal}
                  primary={isPollsOpen}
                  disabled={isPollsOpen}
                >
                  Polls Open
                </Button>
              </SegmentedButton>
            </p>
          </Prose>
          <Prose className="print-only">
            <h1>
              {isPollsOpen ? 'Polls Closed Report' : 'Polls Opened Report'}
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
