import React, { useEffect, useState, useCallback } from 'react'
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
import useInterval from './hooks/useInterval'

import LoadElectionScreen from './screens/LoadElectionScreen'
import DashboardScreen from './screens/DashboardScreen'

import 'normalize.css'
import './App.css'
import fetchJSON from './util/fetchJSON'
import { get as getConfig, patch as patchConfig } from './api/config'

const App: React.FC = () => {
  const [cardServerAvailable, setCardServerAvailable] = useState(true)
  const [election, setElection] = useState<OptionalElection>()
  // used to hide batches while they're being deleted
  const [pendingDeleteBatchIds, setPendingDeleteBatchIds] = useState<number[]>(
    []
  )
  const [isTestMode, setTestMode] = useState<boolean>()
  const [status, setStatus] = useState<ScanStatusResponse>({ batches: [] })
  const [loadingElection, setLoadingElection] = useState(false)
  const { batches } = status
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
    } catch (error) {
      console.log('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [setElection])

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

  const ejectUSB = useCallback(
    async () =>
      fetch('/usbstick/eject', {
        method: 'post',
      }),
    []
  )

  const zeroData = useCallback(async () => {
    try {
      fetch('/scan/zero', {
        method: 'post',
      })
    } catch (error) {
      console.log('failed zeroData()', error) // eslint-disable-line no-console
    }
  }, [])

  const toggleTestMode = useCallback(async () => {
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (confirm('Toggling test mode will zero out your scans. Are you sure?')) {
      setTestMode(!isTestMode)
      await patchConfig({ testMode: !isTestMode })
    }
  }, [isTestMode, setTestMode])

  const exportResults = useCallback(async () => {
    try {
      const response = await fetch(`/scan/export`, {
        method: 'post',
      })
      const blob = await response.blob()
      fileDownload(blob, 'vx-results.csv', 'text/csv')
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
      <Screen>
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
          {typeof isTestMode === 'boolean' && (
            <Button onClick={toggleTestMode}>
              {isTestMode ? 'Live mode…' : 'Test mode…'}
            </Button>
          )}
          <Button onClick={unconfigureServer}>Factory Reset</Button>
          <Button onClick={zeroData}>Zero</Button>
          <Button onClick={ejectUSB}>Eject USB</Button>
          <Button onClick={exportResults}>Export</Button>
          <Button disabled={isScanning} primary onClick={scanBatch}>
            Scan New Batch
          </Button>
        </ButtonBar>
      </Screen>
    )
  }

  return <LoadElectionScreen setElection={setElection} />
}

export default App
