import React, { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Route, Switch, useHistory } from 'react-router-dom'
import fileDownload from 'js-file-download'
import pluralize from 'pluralize'
import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import {
  ButtonEvent,
  CardData,
  ScanStatusResponse,
  CardReadLongResponse,
  CardReadResponse,
} from './config/types'

import Button from './components/Button'
import Main, { MainChild } from './components/Main'
import Screen from './components/Screen'
import USBController from './components/USBController'
import useInterval from './hooks/useInterval'

import LoadElectionScreen from './screens/LoadElectionScreen'
import DashboardScreen from './screens/DashboardScreen'
import BallotReviewScreen from './screens/BallotReviewScreen'
import BallotEjectScreen from './screens/BallotEjectScreen'

import 'normalize.css'
import './App.css'
import fetchJSON from './util/fetchJSON'
import { get as getConfig, patch as patchConfig } from './api/config'
import LinkButton from './components/LinkButton'
import MainNav from './components/MainNav'

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
  const { adjudication } = status

  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    getConfig().then((config) => {
      setElection(config.election)
      setTestMode(config.testMode)
    })
  }, [])

  const updateStatus = useCallback(async () => {
    try {
      const newStatus = await fetchJSON<ScanStatusResponse>('/scan/status')
      setStatus((prevStatus) => {
        if (JSON.stringify(prevStatus) === JSON.stringify(newStatus)) {
          return prevStatus
        }
        if (newStatus.batches[0]?.endedAt) {
          setIsScanning(false)
        }
        return newStatus
      })
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
    setIsScanning(true)
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
              <BallotReviewScreen
                adjudicationStatus={adjudication}
                isTestMode={isTestMode}
              />
            </Route>
            <Route path="/eject">
              <BallotEjectScreen
                continueScanning={() => {
                  // eslint-disable-next-line no-console
                  console.log('restart scanning')
                }}
              />
            </Route>
            <Route path="/">
              <Main>
                <MainChild maxWidth={false}>
                  <DashboardScreen
                    adjudicationStatus={adjudication}
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
              <MainNav isTestMode={isTestMode}>
                <USBController />
                {typeof isTestMode === 'boolean' && (
                  <Button small onPress={toggleTestMode}>
                    {isTestMode ? 'Live mode…' : 'Test mode…'}
                  </Button>
                )}
                <Button small onPress={unconfigureServer}>
                  Factory Reset
                </Button>
                <Button small onPress={zeroData}>
                  Zero
                </Button>
                <LinkButton
                  small
                  to="/review"
                  disabled={adjudication.remaining === 0}
                >
                  Review{' '}
                  {!!adjudication.remaining &&
                    pluralize('ballots', adjudication.remaining, true)}
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
                <Button small disabled={isScanning} primary onPress={scanBatch}>
                  Scan New Batch
                </Button>
              </MainNav>
            </Route>
          </Switch>
        </Screen>
      </BrowserRouter>
    )
  }

  return <LoadElectionScreen setElection={setElection} />
}

export default App
