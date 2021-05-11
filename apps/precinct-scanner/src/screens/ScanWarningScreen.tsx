/* istanbul ignore file */
import React, { useState } from 'react'
import { Button, Prose, Text } from '@votingworks/ui'

import { PlaceholderGraphic } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import Modal from '../components/Modal'

const ScanWarningScreen: React.FC = () => {
  const [confirmTabulate, setConfirmTabulate] = useState(false)
  const openConfirmTabulateModal = () => setConfirmTabulate(true)
  const closeConfirmTabulateModal = () => setConfirmTabulate(false)

  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    closeConfirmTabulateModal()
    console.log('dismiss screen')
  }

  return (
    <CenteredScreen infoBar={false}>
      <PlaceholderGraphic />
      <CenteredLargeProse>
        <h1>Overvote Warning</h1>
        <p>Remove the ballot, fix the issue, then scan again.</p>
        <Text italic>Ask a poll worker if you need assistance.</Text>
      </CenteredLargeProse>
      <Absolute bottom left right>
        <Bar style={{ justifyContent: 'flex-end' }}>
          <div>
            Optionally, this ballot can be tabulated as is:{' '}
            <Button onPress={openConfirmTabulateModal}>Tabulate Ballot</Button>
          </div>
        </Bar>
      </Absolute>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Tabulate Ballot with Errors?</h1>
              <p>Contests with errors will not be counted.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button danger onPress={onPressPlaceholder}>
                Yes, Tabulate Ballot
              </Button>
              <Button onPress={closeConfirmTabulateModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmTabulateModal}
        />
      )}
    </CenteredScreen>
  )
}

export default ScanWarningScreen
