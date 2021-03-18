import React, { useEffect, useState, useCallback } from 'react'
import { Route, Switch, useHistory } from 'react-router-dom'
import pluralize from 'pluralize'
import { MarkThresholds, Optional } from '@votingworks/types'
import styled from 'styled-components'

import { ScanStatusResponse, MachineConfig } from './config/types'
import { ElectionDefinition } from './util/ballot-package'

import AppContext from './contexts/AppContext'

import {
  getStatus as usbDriveGetStatus,
  doMount,
  doUnmount,
  UsbDriveStatus,
} from './lib/usbstick'

import Button from './components/Button'
import Main, { MainChild } from './components/Main'
import Screen from './components/Screen'
import Prose from './components/Prose'
import Text from './components/Text'
import ScanButton from './components/ScanButton'
import USBControllerButton from './components/USBControllerButton'
import useInterval from './hooks/useInterval'

import LoadElectionScreen from './screens/LoadElectionScreen'
import DashboardScreen from './screens/DashboardScreen'
import DebugScreen from './screens/DebugScreen'
import BallotReviewScreen from './screens/BallotReviewScreen'
import BallotEjectScreen from './screens/BallotEjectScreen'
import AdvancedOptionsScreen from './screens/AdvancedOptionsScreen'

import 'normalize.css'
import './App.css'
import fetchJSON from './util/fetchJSON'
import download from './util/download'
import * as config from './api/config'
import LinkButton from './components/LinkButton'
import MainNav from './components/MainNav'
import StatusFooter from './components/StatusFooter'

import ExportResultsModal from './components/ExportResultsModal'
import machineConfigProvider from './util/machineConfig'

const Buttons = styled.div`
  padding: 10px 0;
  & * {
    margin-right: 10px;
  }
`

const App: React.FC = () => {
  const history = useHistory()
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [
    electionDefinition,
    setElectionDefinition,
  ] = useState<ElectionDefinition>()
  const [electionJustLoaded, setElectionJustLoaded] = useState(false)
  const [electionHash, setElectionHash] = useState<string>()
  const [isTestMode, setTestMode] = useState(false)
  const [isTogglingTestMode, setTogglingTestMode] = useState(false)
  const [status, setStatus] = useState<ScanStatusResponse>({
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
  })

  const [usbStatus, setUsbStatus] = useState(UsbDriveStatus.absent)
  const [recentlyEjected, setRecentlyEjected] = useState(false)

  const [isExportingCVRs, setIsExportingCVRs] = useState(false)

  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
  })

  const [markThresholds, setMarkThresholds] = useState<
    Optional<MarkThresholds>
  >()

  const { adjudication } = status

  const [isScanning, setIsScanning] = useState(false)

  const refreshConfig = useCallback(async () => {
    const {
      electionDefinition: refreshedElectionDefinition,
      testMode,
      markThresholdOverrides,
    } = await config.get()
    setElectionDefinition(refreshedElectionDefinition)
    setTestMode(testMode)
    setMarkThresholds(markThresholdOverrides ?? undefined)
  }, [])

  const updateElectionDefinition = async (e: Optional<ElectionDefinition>) => {
    setElectionDefinition(e)
    setElectionJustLoaded(true)
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshConfig()
        setIsConfigLoaded(true)
      } catch (e) {
        window.setTimeout(initialize, 1000)
      }
    }

    initialize()
  }, [refreshConfig])

  useEffect(() => {
    const initialize = async () => {
      try {
        const newMachineConfig = await machineConfigProvider.get()
        setMachineConfig(newMachineConfig)
      } catch (e) {
        // TODO: what should happen in machineConfig not returned?
      }
    }

    initialize()
  }, [setMachineConfig])

  const updateStatus = useCallback(async () => {
    try {
      const newStatus = await fetchJSON<ScanStatusResponse>('/scan/status')
      setElectionHash(newStatus.electionHash)
      setStatus((prevStatus) => {
        if (JSON.stringify(prevStatus) === JSON.stringify(newStatus)) {
          return prevStatus
        }
        setIsScanning(
          newStatus.adjudication.remaining === 0 &&
            newStatus.batches.some(({ endedAt }) => !endedAt)
        )
        return newStatus
      })
    } catch (error) {
      setIsScanning(false)
      console.log('failed updateStatus()', error) // eslint-disable-line no-console
    }
  }, [setStatus])

  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElectionDefinition(undefined)
      await refreshConfig()
      history.replace('/')
    } catch (error) {
      console.log('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [history, refreshConfig])

  const scanBatch = useCallback(async () => {
    setIsScanning(true)
    try {
      const result = await (
        await fetch('/scan/scanBatch', {
          method: 'post',
        })
      ).json()
      if (result.status !== 'ok') {
        // eslint-disable-next-line no-alert
        window.alert(`could not scan: ${result.status}`)
        setIsScanning(false)
      }
    } catch (error) {
      console.log('failed handleFileInput()', error) // eslint-disable-line no-console
    }
  }, [])

  const continueScanning = useCallback(async (override = false) => {
    setIsScanning(true)
    try {
      await fetch('/scan/scanContinue', {
        method: 'post',
        body: override
          ? (() => {
              const data = new URLSearchParams()
              data.append('override', '1')
              return data
            })()
          : undefined,
      })
    } catch (error) {
      console.log('failed handleFileInput()', error) // eslint-disable-line no-console
    }
  }, [])

  const zeroData = useCallback(async () => {
    try {
      await fetch('/scan/zero', {
        method: 'post',
      })
      await refreshConfig()
      history.replace('/')
    } catch (error) {
      console.log('failed zeroData()', error) // eslint-disable-line no-console
    }
  }, [history])

  const backup = useCallback(async () => {
    await download('/scan/backup')
  }, [])

  const toggleTestMode = useCallback(async () => {
    try {
      setTogglingTestMode(true)
      await config.setTestMode(!isTestMode)
      await refreshConfig()
      history.replace('/')
    } finally {
      setTogglingTestMode(false)
    }
  }, [history, isTestMode, refreshConfig])

  const setMarkThresholdOverrides = useCallback(
    async (markThresholdOverrides: Optional<MarkThresholds>) => {
      await config.setMarkThresholdOverrides(markThresholdOverrides)
      await refreshConfig()
      history.replace('/')
    },
    [history, refreshConfig]
  )

  const deleteBatch = useCallback(async (id: string) => {
    await fetchJSON(`/scan/batch/${id}`, {
      method: 'DELETE',
    })
  }, [])

  useInterval(
    useCallback(() => {
      if (electionDefinition) {
        updateStatus()
      }
    }, [electionDefinition, updateStatus]),
    1000
  )

  const doMountIfNotRecentlyEjected = useCallback(async () => {
    if (!recentlyEjected) {
      await doMount()
    }
  }, [recentlyEjected])

  const doEject = async () => {
    setUsbStatus(UsbDriveStatus.ejecting)
    setRecentlyEjected(true)
    await doUnmount()
  }

  useInterval(
    () => {
      ;(async () => {
        const usbDriveStatus = await usbDriveGetStatus()
        setUsbStatus(usbDriveStatus)
        if (usbDriveStatus === UsbDriveStatus.present) {
          await doMountIfNotRecentlyEjected()
        } else {
          setRecentlyEjected(false)
        }
      })()
    },
    usbStatus === UsbDriveStatus.notavailable ? 0 : 2000
  )

  const displayUsbStatus =
    recentlyEjected && usbStatus !== UsbDriveStatus.ejecting
      ? UsbDriveStatus.recentlyEjected
      : usbStatus

  useEffect(() => {
    updateStatus()
  }, [updateStatus])

  useEffect(() => {
    if (
      electionJustLoaded &&
      displayUsbStatus === UsbDriveStatus.recentlyEjected
    ) {
      setElectionJustLoaded(false)
    }
  }, [electionJustLoaded, displayUsbStatus])

  if (electionDefinition) {
    if (electionJustLoaded) {
      return (
        <AppContext.Provider
          value={{
            usbDriveStatus: displayUsbStatus,
            usbDriveEject: doEject,
            machineConfig,
            electionDefinition,
            electionHash,
          }}
        >
          <Screen>
            <Main>
              <MainChild center padded>
                <Prose>
                  <h1>Ballot Scanner Configured</h1>
                  <Text>
                    Ballot Scanner successfully configured. You may now eject
                    the USB drive.
                  </Text>
                </Prose>
                <Buttons>
                  <Button onPress={() => setElectionJustLoaded(false)}>
                    Close
                  </Button>
                  <USBControllerButton small={false} primary />
                </Buttons>
              </MainChild>
            </Main>
            <MainNav isTestMode={false} />
          </Screen>
        </AppContext.Provider>
      )
    }
    if (adjudication.remaining > 0 && !isScanning) {
      return (
        <AppContext.Provider
          value={{
            usbDriveStatus: displayUsbStatus,
            usbDriveEject: doEject,
            electionDefinition,
            electionHash,
            machineConfig,
          }}
        >
          <BallotEjectScreen
            continueScanning={continueScanning}
            isTestMode={isTestMode}
          />
        </AppContext.Provider>
      )
    }

    let exportButtonTitle
    if (adjudication.remaining > 0) {
      exportButtonTitle =
        'You cannot export results until all ballots have been adjudicated.'
    } else if (status.batches.length === 0) {
      exportButtonTitle =
        'You cannot export results until you have scanned at least 1 ballot.'
    }

    return (
      <AppContext.Provider
        value={{
          usbDriveStatus: displayUsbStatus,
          usbDriveEject: doEject,
          electionDefinition,
          electionHash,
          machineConfig,
        }}
      >
        <Switch>
          {process.env.NODE_ENV === 'development' && (
            <Route path="/debug">
              <DebugScreen isTestMode={isTestMode} />
            </Route>
          )}
          <Route path="/review">
            <BallotReviewScreen
              adjudicationStatus={adjudication}
              isTestMode={isTestMode}
            />
          </Route>
          <Route path="/advanced">
            <AdvancedOptionsScreen
              unconfigureServer={unconfigureServer}
              zeroData={zeroData}
              backup={backup}
              hasBatches={!!status.batches.length}
              isTestMode={isTestMode}
              toggleTestMode={toggleTestMode}
              setMarkThresholdOverrides={setMarkThresholdOverrides}
              markThresholds={markThresholds}
              isTogglingTestMode={isTogglingTestMode}
              electionDefinition={electionDefinition}
            />
          </Route>
          <Route path="/">
            <Screen>
              <Main>
                <MainChild maxWidth={false}>
                  <DashboardScreen
                    adjudicationStatus={adjudication}
                    isScanning={isScanning}
                    status={status}
                    deleteBatch={deleteBatch}
                  />
                </MainChild>
              </Main>
              <MainNav isTestMode={isTestMode}>
                <USBControllerButton />
                <LinkButton small to="/advanced">
                  Advanced
                </LinkButton>
                <Button
                  small
                  onPress={() => setIsExportingCVRs(true)}
                  disabled={
                    adjudication.remaining > 0 || status.batches.length === 0
                  }
                  title={exportButtonTitle}
                >
                  Export
                </Button>
                {false && (
                  <LinkButton
                    small
                    to="/review"
                    disabled={adjudication.remaining === 0}
                  >
                    Review{' '}
                    {!!adjudication.remaining &&
                      pluralize('ballots', adjudication.remaining, true)}
                  </LinkButton>
                )}
                <ScanButton onPress={scanBatch} disabled={isScanning} />
              </MainNav>
              <StatusFooter />
            </Screen>
            {isExportingCVRs && (
              <ExportResultsModal
                onClose={() => setIsExportingCVRs(false)}
                usbDriveStatus={displayUsbStatus}
                electionDefinition={electionDefinition}
                isTestMode={isTestMode}
                numberOfBallots={status.batches.reduce(
                  (prev, next) => prev + next.count,
                  0
                )}
              />
            )}
          </Route>
        </Switch>
      </AppContext.Provider>
    )
  }

  if (isConfigLoaded) {
    return (
      <AppContext.Provider
        value={{
          usbDriveStatus: displayUsbStatus,
          usbDriveEject: doEject,
          machineConfig,
          electionDefinition,
        }}
      >
        <LoadElectionScreen
          setElectionDefinition={updateElectionDefinition}
          usbDriveStatus={displayUsbStatus}
        />
      </AppContext.Provider>
    )
  }

  return (
    <Screen>
      <Main>
        <MainChild maxWidth={false}>
          <h1>Loading Configuration...</h1>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default App
