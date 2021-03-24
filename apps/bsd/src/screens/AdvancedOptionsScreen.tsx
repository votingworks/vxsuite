import {
  ElectionDefinition,
  MarkThresholds,
  Optional,
} from '@votingworks/types'
import React, { useCallback, useEffect, useState } from 'react'
import Button from '../components/Button'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import ToggleTestModeButton from '../components/ToggleTestModeButton'
import SetMarkThresholdsModal from '../components/SetMarkThresholdsModal'

interface Props {
  unconfigureServer: () => Promise<void>
  zeroData: () => Promise<void>
  backup: () => Promise<void>
  hasBatches: boolean
  isTestMode: boolean
  isTogglingTestMode: boolean
  toggleTestMode: () => Promise<void>
  setMarkThresholdOverrides: (
    markThresholds: Optional<MarkThresholds>
  ) => Promise<void>
  markThresholds: Optional<MarkThresholds>
  electionDefinition: ElectionDefinition
}

const AdvancedOptionsScreen: React.FC<Props> = ({
  unconfigureServer,
  zeroData,
  backup,
  hasBatches,
  isTestMode,
  isTogglingTestMode,
  toggleTestMode,
  setMarkThresholdOverrides,
  markThresholds,
  electionDefinition,
}) => {
  const [isConfirmingFactoryReset, setIsConfirmingFactoryReset] = useState(
    false
  )
  const [isFactoryResetting, setIsFactoryResetting] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupError, setBackupError] = useState('')
  const toggleIsConfirmingFactoryReset = () =>
    setIsConfirmingFactoryReset((s) => !s)
  const [isConfirmingZero, setIsConfirmingZero] = useState(false)
  const [isSetMarkThresholdModalOpen, setIsMarkThresholdModalOpen] = useState(
    false
  )
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

  useEffect(() => {
    if (isFactoryResetting) {
      let isMounted = true
      ;(async () => {
        await unconfigureServer()
        if (isMounted) {
          setIsFactoryResetting(false)
        }
      })()
      return () => {
        isMounted = false
      }
    }
  }, [isFactoryResetting, unconfigureServer])

  return (
    <React.Fragment>
      <Screen>
        <Main>
          <MainChild>
            <Prose>
              <h1>Advanced Options</h1>
              <p>
                <ToggleTestModeButton
                  isTestMode={isTestMode}
                  isTogglingTestMode={isTogglingTestMode}
                  toggleTestMode={toggleTestMode}
                />
              </p>
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
              <p>
                <Button
                  onPress={() => setIsMarkThresholdModalOpen(true)}
                  disabled={hasBatches}
                >
                  {markThresholds === undefined
                    ? 'Override Mark Thresholds…'
                    : 'Reset Mark Thresholds…'}
                </Button>
              </p>
              {backupError && <p style={{ color: 'red' }}>{backupError}</p>}
              <p>
                <Button onPress={exportBackup} disabled={isBackingUp}>
                  {isBackingUp ? 'Exporting…' : 'Export Backup…'}
                </Button>
              </p>
              {process.env.NODE_ENV === 'development' && (
                <p>
                  <LinkButton to="/debug">Debug…</LinkButton>
                </p>
              )}
            </Prose>
          </MainChild>
        </Main>
        <MainNav isTestMode={isTestMode}>
          <LinkButton small to="/">
            Back to Dashboard
          </LinkButton>
        </MainNav>
      </Screen>
      {isConfirmingZero && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Delete All Scanned Ballot Data?</h1>
              <p>
                This will permanently delete all scanned ballot data and reset
                the scanner to only be configured with the current election,
                with the default mark thresholds.
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
      )}
      {isConfirmingFactoryReset && (
        <Modal
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
              <Button
                danger
                onPress={() => {
                  setIsConfirmingFactoryReset(false)
                  setIsFactoryResetting(true)
                }}
              >
                Yes, Factory Reset
              </Button>
            </React.Fragment>
          }
          onOverlayClick={toggleIsConfirmingFactoryReset}
        />
      )}
      {isFactoryResetting && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Resetting…</h1>
            </Prose>
          }
        />
      )}
      {isSetMarkThresholdModalOpen && (
        <SetMarkThresholdsModal
          setMarkThresholdOverrides={setMarkThresholdOverrides}
          markThresholds={electionDefinition.election.markThresholds}
          markThresholdOverrides={markThresholds}
          onClose={() => setIsMarkThresholdModalOpen(false)}
        />
      )}
    </React.Fragment>
  )
}

export default AdvancedOptionsScreen
