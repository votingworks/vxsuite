import React, { useEffect, useState, useCallback } from 'react'
import { Route, Switch, useHistory } from 'react-router-dom'
import fileDownload from 'js-file-download'
import pluralize from 'pluralize'
import { Election, OptionalElection } from '@votingworks/ballot-encoder'
import Prose from './components/Prose'
import Modal from './components/Modal'

import {
  CardData,
  ScanStatusResponse,
  CardReadLongResponse,
  CardReadResponse,
} from './config/types'

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
import { get as getConfig, patch as patchConfig } from './api/config'
import LinkButton from './components/LinkButton'
import MainNav from './components/MainNav'
import StatusFooter from './components/StatusFooter'

const App: React.FC = () => {
  const history = useHistory()
  const [cardServerAvailable, setCardServerAvailable] = useState(true)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [election, setElection] = useState<OptionalElection>()
  const [electionHash, setElectionHash] = useState<string>()
  // used to hide batches while they're being deleted
  const [pendingDeleteBatchIds, setPendingDeleteBatchIds] = useState<number[]>(
    []
  )
  const [isTestMode, setTestMode] = useState(false)
  const [isTogglingTestMode, setTogglingTestMode] = useState(false)
  const [status, setStatus] = useState<ScanStatusResponse>({
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
  })
  const [loadingElection, setLoadingElection] = useState(false)

  const [usbStatus, setUsbStatus] = useState(UsbDriveStatus.absent)
  const [recentlyEjected, setRecentlyEjected] = useState(false)

  const [isExportingCVRs, setIsExportingCVRs] = useState(false)

  const { adjudication } = status

  const [isScanning, setIsScanning] = useState(false)

  const refreshConfig = useCallback(async () => {
    const config = await getConfig()
    setElection(config.election)
    setTestMode(config.testMode)
  }, [])

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

  const configureServer = useCallback(
    async (configuredElection: Election) => {
      try {
        await patchConfig({ election: configuredElection })
        updateStatus()
      } catch (error) {
        console.log('failed configureServer()', error) // eslint-disable-line no-console
      }
    },
    [updateStatus]
  )

  const uploadElection = useCallback(
    async (electionToUpload: OptionalElection) => {
      if (electionToUpload) await configureServer(electionToUpload)
      setElection(electionToUpload)
    },
    [setElection, configureServer]
  )

  const unconfigureServer = useCallback(async () => {
    try {
      await patchConfig({ election: null })
      await refreshConfig()
      history.replace('/')
    } catch (error) {
      console.log('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [history, refreshConfig])

  const loadElectionFromCard = useCallback(async () => {
    const card = await fetchJSON<CardReadLongResponse>('/card/read_long')
    return JSON.parse(card.longValue)
  }, [])

  const processCardData = useCallback(
    async (cardData: CardData, longValueExists: boolean) => {
      if (cardData.t === 'admin') {
        if (!election) {
          if (longValueExists && !loadingElection) {
            setLoadingElection(true)
            await uploadElection(await loadElectionFromCard())
            setLoadingElection(false)
          }
        }
      }
    },
    [election, loadElectionFromCard, loadingElection, uploadElection]
  )

  const readCard = useCallback(async () => {
    try {
      const card = await fetchJSON<CardReadResponse>('/card/read')
      if (card.present && card.shortValue) {
        const cardData = JSON.parse(card.shortValue) as CardData
        processCardData(cardData, card.longValueExists)
      }
    } catch {
      setCardServerAvailable(false)
    }
  }, [processCardData, setCardServerAvailable])

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
      await patchConfig({ testMode: !isTestMode })
      await refreshConfig()
      history.replace('/')
    } finally {
      setTogglingTestMode(false)
    }
  }, [history, isTestMode, refreshConfig])

  const exportResults = useCallback(async () => {
    if (!election) {
      return
    }

    setIsExportingCVRs(true)

    try {
      const response = await fetch(`/scan/export`, {
        method: 'post',
      })

      const blob = await response.blob()

      setIsExportingCVRs(false)

      if (response.status !== 200) {
        // eslint-disable-next-line no-console
        console.log('error downloading CVRs')
        return
      }

      const cvrFilename = `${`cvrs-${election.county.name}-${election.title}`
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/(^-|-$)+/g, '')
        .toLocaleLowerCase()}.jsonl`

      if (window.kiosk) {
        const fileWriter = await window.kiosk.saveAs({
          defaultPath: cvrFilename,
        })

        if (!fileWriter) {
          throw new Error('could not begin download; no file was chosen')
        }

        await fileWriter.write(await blob.text())
        await fileWriter.end()
      } else {
        fileDownload(blob, cvrFilename, 'application/x-jsonlines')
      }
    } catch (error) {
      setIsExportingCVRs(false)
      console.log('failed getOutputFile()', error) // eslint-disable-line no-console
    }
  }, [election, setIsExportingCVRs])

  const deleteBatch = useCallback(
    async (id: number) => {
      setPendingDeleteBatchIds((previousIds) => [...previousIds, id])

      try {
        await fetch(`/scan/batch/${id}`, {
          method: 'DELETE',
        })
      } finally {
        setPendingDeleteBatchIds((previousIds) =>
          previousIds.filter((previousId) => previousId !== id)
        )
      }
    },
    [setPendingDeleteBatchIds]
  )

  useInterval(
    useCallback(() => {
      if (election) {
        updateStatus()
      } else if (cardServerAvailable) {
        readCard()
      }
    }, [election, cardServerAvailable, updateStatus, readCard]),
    1000
  )

  const doMountIfNotRecentlyEjected = useCallback(async () => {
    if (!recentlyEjected) {
      await doMount()
    }
  }, [recentlyEjected])

  const doEject = async () => {
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

  const displayUsbStatus = recentlyEjected
    ? UsbDriveStatus.recentlyEjected
    : usbStatus

  useEffect(() => {
    updateStatus()
  }, [updateStatus])

  if (election) {
    if (adjudication.remaining > 0 && !isScanning) {
      return (
        <BallotEjectScreen
          continueScanning={continueScanning}
          isTestMode={isTestMode}
        />
      )
    }

    return (
      <AppContext.Provider
        value={{
          usbDriveStatus: displayUsbStatus,
          usbDriveEject: doEject,
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
              isTogglingTestMode={isTogglingTestMode}
            />
          </Route>
          <Route path="/">
            <Screen>
              <Main>
                <MainChild maxWidth={false}>
                  <DashboardScreen
                    adjudicationStatus={adjudication}
                    isScanning={isScanning}
                    status={{
                      ...status,
                      batches: status.batches.filter(
                        (batch) => !pendingDeleteBatchIds.includes(batch.id)
                      ),
                    }}
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
                  onPress={exportResults}
                  disabled={adjudication.remaining > 0}
                  title={
                    adjudication.remaining > 0
                      ? 'You cannot export results until all ballots have been adjudicated.'
                      : undefined
                  }
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
                <Button small disabled={isScanning} primary onPress={scanBatch}>
                  Scan New Batch
                </Button>
              </MainNav>
              <StatusFooter election={election} electionHash={electionHash} />
            </Screen>
            <Modal
              isOpen={isExportingCVRs}
              centerContent
              content={
                <Prose textCenter>
                  <h1>Exporting CVRs…</h1>
                </Prose>
              }
            />
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
        }}
      >
        <LoadElectionScreen
          setElection={setElection}
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
