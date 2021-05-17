/* istanbul ignore file */
import React, { useState } from 'react'

import { Precinct, ElectionDefinition } from '@votingworks/types'
import { Button, Prose } from '@votingworks/ui'
import { CenteredScreen } from '../components/Layout'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import Modal from '../components/Modal'

interface Props {
  appPrecinctId: string
  ballotsScannedCount: number
  electionDefinition: ElectionDefinition
  isPollsOpen: boolean
  openPolls: () => void
  closePolls: () => void
}

const PollWorkerScreen: React.FC<Props> = ({
  appPrecinctId,
  ballotsScannedCount,
  electionDefinition,
  isPollsOpen,
  openPolls,
  closePolls,
}) => {
  const { election } = electionDefinition
  const precinct = election.precincts.find(
    (p) => p.id === appPrecinctId
  ) as Precinct

  const [confirmOpenPolls, setConfirmOpenPolls] = useState(false)
  const openConfirmOpenPollsModal = () => setConfirmOpenPolls(true)
  const closeConfirmOpenPollsModal = () => setConfirmOpenPolls(false)
  const openPollsAndSaveZeroReport = () => {
    openPolls()
    closeConfirmOpenPollsModal()
  }

  const [confirmClosePolls, setConfirmClosePolls] = useState(false)
  const openConfirmClosePollsModal = () => setConfirmClosePolls(true)
  const closeConfirmClosePollsModal = () => setConfirmClosePolls(false)
  const closePollsAndSaveTabulationReport = () => {
    closePolls()
    closeConfirmClosePollsModal()
  }

  return (
    <CenteredScreen infoBarMode="pollworker">
      <Prose textCenter>
        <h1>Poll Worker Actions</h1>
        <p>
          {isPollsOpen ? (
            <Button large onPress={openConfirmClosePollsModal}>
              Close Polls for {precinct.name}
            </Button>
          ) : (
            <Button large onPress={openConfirmOpenPollsModal}>
              Open Polls for {precinct.name}
            </Button>
          )}
        </p>
      </Prose>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned: <strong>{ballotsScannedCount}</strong>{' '}
          </div>
        </Bar>
      </Absolute>
      {confirmOpenPolls && (
        <Modal
          content={
            <Prose>
              <h1>Open Polls and Save Zero Report</h1>
              <p>
                Zero Report will be saved to the current poll worker card.
                Insert this card into VxMark to print the report.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={openPollsAndSaveZeroReport}>
                Save Zero Report and Open Polls
              </Button>
              <Button onPress={closeConfirmOpenPollsModal}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
      {confirmClosePolls && (
        <Modal
          content={
            <Prose>
              <h1>Close Polls and Save Tabulation Report</h1>
              <p>
                Tabulation Report will be saved to the current poll worker card.
                Insert this card into VxMark to print the report.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={closePollsAndSaveTabulationReport}>
                Save Tabulation Report and Close Polls
              </Button>
              <Button onPress={closeConfirmClosePollsModal}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
    </CenteredScreen>
  )
}

export default PollWorkerScreen
