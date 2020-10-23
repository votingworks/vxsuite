import React, { useState, useCallback } from 'react'

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
  backup: () => Promise<void>
  hasBatches: boolean
  isTestMode: boolean
  togglingTestMode: boolean
  toggleTestMode: () => Promise<void>
}

const AdvancedOptionsScreen: React.FC<Props> = ({
  unconfigureServer,
  zeroData,
  backup,
  hasBatches,
  isTestMode,
  togglingTestMode,
  toggleTestMode,
}) => {
  const [isConfirmingFactoryReset, setIsConfirmingFactoryReset] = useState(
    false
  )
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupError, setBackupError] = useState('')
  const toggleIsConfirmingFactoryReset = () =>
    setIsConfirmingFactoryReset((s) => !s)
  const [isConfirmingZero, setIsConfirmingZero] = useState(false)
  const toggleIsConfirmingZero = () => setIsConfirmingZero((s) => !s)
  const exportBackup = useCallback(async () => {
    try {
      setBackupError('')
      setIsBackingUp(true)
      await backup()
    } catch (error) {
      setBackupError(error.toString())
    } finally {
      setIsBackingUp(false)
    }
  }, [backup])
  return (
    <React.Fragment>
      <Screen>
        <Main>
          <MainChild>
            <Prose>
              <h1>Advanced Options</h1>
              {typeof isTestMode === 'boolean' && (
                <p>
                  <Button onPress={toggleTestMode} disabled={togglingTestMode}>
                    {togglingTestMode
                      ? 'Switching…'
                      : isTestMode
                      ? 'Toggle to Live Mode'
                      : 'Toggle to Test Mode'}
                  </Button>
                </p>
              )}
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
              {backupError && <p style={{ color: 'red' }}>{backupError}</p>}
              <p>
                <Button onPress={exportBackup} disabled={isBackingUp}>
                  {isBackingUp ? 'Exporting…' : 'Export Backup…'}
                </Button>
              </p>
            </Prose>
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
