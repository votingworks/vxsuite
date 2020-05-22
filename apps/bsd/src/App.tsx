import React, { useEffect, useState, useCallback } from 'react'
import fileDownload from 'js-file-download'
import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import {
  ButtonEvent,
  CardData,
  ScanStatusResponse,
  UnconfigureResponse,
  CardReadLongResponse,
  CardReadResponse,
} from './config/types'

import Brand from './components/Brand'
import Button from './components/Button'
import ButtonBar from './components/ButtonBar'
import Main, { MainChild } from './components/Main'
import Screen from './components/Screen'
import useStateWithLocalStorage from './hooks/useStateWithLocalStorage'
import useInterval from './hooks/useInterval'

import LoadElectionScreen from './screens/LoadElectionScreen'
import DashboardScreen from './screens/DashboardScreen'

import 'normalize.css'
import './App.css'
import fetchJSON from './util/fetchJSON'
import configure from './api/configure'

const App: React.FC = () => {
  const [cardServerAvailable, setCardServerAvailable] = useState(true)
  const [election, setElection] = useStateWithLocalStorage<OptionalElection>(
    'election'
  )
  // used to hide batches while they're being deleted
  const [pendingDeleteBatchIds, setPendingDeleteBatchIds] = useState<number[]>(
    []
  )
  const [status, setStatus] = useState<ScanStatusResponse>({ batches: [] })
  const [loadingElection, setLoadingElection] = useState(false)
  const { batches } = status
  const isScanning = batches && batches[0] && !batches[0].endedAt

  const unconfigure = useCallback(() => {
    setElection(undefined)
    window.localStorage.clear()
  }, [setElection])

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
        await configure(configuredElection)
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
      const response = await fetchJSON<UnconfigureResponse>(
        '/scan/unconfigure',
        {
          method: 'post',
        }
      )
      if (response.status === 'ok') {
        unconfigure()
      }
    } catch (error) {
      console.log('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [unconfigure])

  const fetchElection = useCallback(
    async () =>
      fetchJSON<CardReadLongResponse>('/card/read_long').then((card) =>
        JSON.parse(card.longValue)
      ),
    []
  )

  const processCardData = useCallback(
    async (cardData: CardData, longValueExists: boolean) => {
      if (cardData.t === 'clerk') {
        if (!election) {
          if (longValueExists && !loadingElection) {
            setLoadingElection(true)
            await uploadElection(await fetchElection())
            setLoadingElection(false)
          }
        }
      }
    },
    [election, fetchElection, loadingElection, uploadElection]
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
    if (!status.electionHash) {
      configureServer(election)
    }
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
          <Brand>VxScan</Brand>
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
