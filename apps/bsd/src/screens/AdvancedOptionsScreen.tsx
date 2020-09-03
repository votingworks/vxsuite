import React, { useState } from 'react'

import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import LinkButton from '../components/LinkButton'
import Button from '../components/Button'

interface Props {
  unconfigureServer: () => Promise<void>
  zeroData: () => Promise<void>
  hasBatches: boolean
}

const AdvancedOptionsScreen = ({
  unconfigureServer,
  zeroData,
  hasBatches,
}: Props) => {
  const [isConfirmingFactoryReset, setIsConfirmingFactoryReset] = useState(
    false
  )
  const toggleIsConfirmingFactoryReset = () =>
    setIsConfirmingFactoryReset((s) => !s)
  const [isConfirmingZero, setIsConfirmingZero] = useState(false)
  const toggleIsConfirmingZero = () => setIsConfirmingZero((s) => !s)
  return (
    <React.Fragment>
      <Screen>
        <Main>
          <MainChild>
            <h1>Advanced Options</h1>
            <p>
              <Button disabled={!hasBatches} onPress={toggleIsConfirmingZero}>
                Delete Ballot Data…
              </Button>
            </p>
            <p>
              <Button onPress={toggleIsConfirmingFactoryReset}>
                Factory Reset…
              </Button>
            </p>
          </MainChild>
        </Main>
        <MainNav>
          <LinkButton small to="/">
            Back to Dashboard
          </LinkButton>
        </MainNav>
      </Screen>
      <Modal
        isOpen={isConfirmingZero}
        centerContent
        content={
          <Prose textCenter>
            <h1>Delete All Scanned Ballot Data?</h1>
            <p>
              This will permanently delete all scanned ballot data and reset the
              scanner to only be configured with the current election.
            </p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={toggleIsConfirmingZero}>Cancel</Button>
            <Button danger onPress={zeroData}>
              Yes, Delete Ballot Data
            </Button>
          </React.Fragment>
        }
        onOverlayClick={toggleIsConfirmingZero}
      />
      <Modal
        isOpen={isConfirmingFactoryReset}
        centerContent
        content={
          <Prose textCenter>
            <h1>Factory Reset?</h1>
            <p>Remove election configuration and all scanned ballot data?</p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={toggleIsConfirmingFactoryReset}>Cancel</Button>
            <Button danger onPress={unconfigureServer}>
              Yes, Factory Reset
            </Button>
          </React.Fragment>
        }
        onOverlayClick={toggleIsConfirmingFactoryReset}
      />
    </React.Fragment>
  )
}

export default AdvancedOptionsScreen
