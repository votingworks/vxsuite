import React, { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Route, Switch, useHistory } from 'react-router-dom'
import fileDownload from 'js-file-download'
import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import {
  ButtonEvent,
  CardData,
  ScanStatusResponse,
  CardReadLongResponse,
  CardReadResponse,
} from './config/types'

import Brand from './components/Brand'
import Button from './components/Button'
import ButtonBar from './components/ButtonBar'
import Main, { MainChild } from './components/Main'
import Screen from './components/Screen'
import USBController from './components/USBController'
import useInterval from './hooks/useInterval'

import LoadElectionScreen from './screens/LoadElectionScreen'
import DashboardScreen from './screens/DashboardScreen'

import 'normalize.css'
import './App.css'
import fetchJSON from './util/fetchJSON'
import { get as getConfig, patch as patchConfig } from './api/config'
import BallotReviewScreen from './screens/BallotReviewScreen'

const App: React.FC = () => {
  const history = useHistory()
  const [cardServerAvailable, setCardServerAvailable] = useState(true)
  const [election, setElection] = useState<OptionalElection>()
  // used to hide batches while they're being deleted
  const [pendingDeleteBatchIds, setPendingDeleteBatchIds] = useState<number[]>(
    []
  )
  const [isTestMode, setTestMode] = useState(false)
  const [status, setStatus] = useState<ScanStatusResponse>({
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
  })
  const [loadingElection, setLoadingElection] = useState(false)
  const { batches, adjudication } = status
  const isScanning = batches && batches[0] && !batches[0].endedAt

  useEffect(() => {
    getConfig().then((config) => {
      setElection(config.election)
      setTestMode(config.testMode)
    })
  }, [])

  const updateStatus = useCallback(async () => {
    try {
      setStatus(await fetchJSON<ScanStatusResponse>('/scan/status'))
    } catch (error) {
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
      setElection(undefined)
      history.replace('/')
    } catch (error) {
      console.log('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [history, setElection])

  const loadElectionFromCard = useCallback(async () => {
    const card = await fetchJSON<CardReadLongResponse>('/card/read_long')
    return JSON.parse(card.longValue)
  }, [])

  const processCardData = useCallback(
    async (cardData: CardData, longValueExists: boolean) => {
      if (cardData.t === 'clerk') {
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
    try {
      await fetch('/scan/scanBatch', {
        method: 'post',
      })
    } catch (error) {
      console.log('failed handleFileInput()', error) // eslint-disable-line no-console
    }
  }, [])

  const invalidateBatch = useCallback(async (event: ButtonEvent) => {
    try {
      const { id } = (event.target as HTMLElement).dataset
      await fetch('/scan/invalidateBatch', {
        method: 'post',
        body: id,
      })
    } catch (error) {
      console.log('failed invalidateBranch()', error) // eslint-disable-line no-console
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

  const toggleTestMode = useCallback(async () => {
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (confirm('Toggling test mode will zero out your scans. Are you sure?')) {
      setTestMode(!isTestMode)
      await patchConfig({ testMode: !isTestMode })
      history.replace('/')
    }
  }, [history, isTestMode, setTestMode])

  const exportResults = useCallback(async () => {
    try {
      const response = await fetch(`/scan/export`, {
        method: 'post',
      })
      const blob = await response.blob()

      if (window.kiosk) {
        const fileWriter = await window.kiosk.saveAs()

        if (!fileWriter) {
          throw new Error('could not begin download; no file was chosen')
        }

        await fileWriter.write(await blob.text())
        await fileWriter.end()
      } else {
        fileDownload(blob, 'vx-results.csv', 'text/csv')
      }
    } catch (error) {
      console.log('failed getOutputFile()', error) // eslint-disable-line no-console
    }
  }, [])

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

  useEffect(() => {
    updateStatus()
  }, [updateStatus])

  if (election) {
    return (
      <BrowserRouter>
        <Screen>
          <Switch>
            <Route path="/review">
              <BallotReviewScreen isTestMode={isTestMode} />
            </Route>
            <Route path="/">
              <Main>
                <MainChild maxWidth={false}>
                  <DashboardScreen
                    invalidateBatch={invalidateBatch}
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
              <ButtonBar secondary naturalOrder separatePrimaryButton>
                <Brand>
                  VxScan
                  {isTestMode && (
                    <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>
                  )}
                </Brand>
                <USBController />
                {typeof isTestMode === 'boolean' && (
                  <Button onClick={toggleTestMode}>
                    {isTestMode ? 'Live mode…' : 'Test mode…'}
                  </Button>
                )}
                <Button onClick={unconfigureServer}>Factory Reset</Button>
                <Button onClick={zeroData}>Zero</Button>
                <Button
                  onClick={exportResults}
                  disabled={adjudication.remaining > 0}
                  title={
                    adjudication.remaining > 0
                      ? 'You cannot export results until all ballots have been adjudicated.'
                      : undefined
                  }
                >
                  Export
                </Button>
                <Button disabled={isScanning} primary onClick={scanBatch}>
                  Scan New Batch
                </Button>
              </ButtonBar>
            </Route>
          </Switch>
        </Screen>
      </BrowserRouter>
    )
  }

  return <LoadElectionScreen setElection={setElection} />
}

export default App
