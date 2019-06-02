import React, { useEffect, useState } from 'react'
import fileDownload from 'js-file-download'

import {
  ButtonEvent,
  CardData,
  Election,
  OptionalElection,
  ScannerStatus,
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

let loadingElection = false

const App: React.FC = () => {
  const [cardServerAvailable, setCardServerAvailable] = useState(true)
  const [election, setElection] = useStateWithLocalStorage<OptionalElection>(
    'election'
  )
  const [status, setStatus] = useState<ScannerStatus>({ batches: [] })
  const { batches } = status
  const isScanning = batches && batches[0] && !batches[0].endedAt

  const uploadElection = (election: OptionalElection) => {
    election && configureServer(election) // eslint-disable-line @typescript-eslint/no-use-before-define
    setElection(election)
  }

  const configureServer = (election: Election) => {
    fetch('/scan/configure', {
      method: 'post',
      body: JSON.stringify(election),
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(r => r.json())
      .then(response => {
        if (response.status === 'ok') {
          updateStatus() // eslint-disable-line @typescript-eslint/no-use-before-define
        }
      })
      .catch(error => {
        console.log('failed handleFileInput()', error) // eslint-disable-line no-console
      })
  }

  const unconfigureServer = () => {
    fetch('/scan/unconfigure', {
      method: 'post',
    })
      .then(r => r.json())
      .then(response => {
        if (response.status === 'ok') {
          setElection(undefined)
        }
      })
      .catch(error => {
        console.log('failed handleFileInput()', error) // eslint-disable-line no-console
      })
  }

  const fetchElection = async () => {
    return fetch('/card/read_long')
      .then(r => r.json())
      .then(card => JSON.parse(card.longValue))
  }

  const processCardData = (cardData: CardData, longValueExists: boolean) => {
    if (cardData.t === 'clerk') {
      if (!election) {
        if (longValueExists && !loadingElection) {
          loadingElection = true
          fetchElection().then(election => {
            setElection(election)
            configureServer(election)
            loadingElection = false
          })
        }
      }
    }
  }

  const readCard = () => {
    fetch('/card/read')
      .then(r => r.json())
      .then(card => {
        if (card.shortValue) {
          const cardData = JSON.parse(card.shortValue) as CardData
          processCardData(cardData, card.longValueExists)
        }
      })
      .catch(() => {
        setCardServerAvailable(false)
      })
  }

  const scanBatch = () => {
    fetch('/scan/scanBatch', {
      method: 'post',
    }).catch(error => {
      console.log('failed handleFileInput()', error) // eslint-disable-line no-console
    })
  }

  const invalidateBranch = (event: ButtonEvent) => {
    const id = (event.target as HTMLElement).dataset.id
    fetch('/scan/invalidateBatch', {
      method: 'post',
      body: id,
    }).catch(error => {
      console.log('failed invalidateBranch()', error) // eslint-disable-line no-console
    })
  }

  const ejectUSB = () => {
    fetch('/usbstick/eject', {
      method: 'post',
    })
  }

  const zeroData = () => {
    fetch('/scan/zero', {
      method: 'post',
    }).catch(error => {
      console.log('failed zeroData()', error) // eslint-disable-line no-console
    })
  }

  const exportResults = () => {
    fetch(`/scan/export`, {
      method: 'post',
    })
      .then(response => response.blob())
      .then(blob => {
        fileDownload(blob, 'vx-results.csv', 'text/csv')
      })
      .catch(error => {
        console.log('failed getOutputFile()', error) // eslint-disable-line no-console
      })
  }

  const updateStatus = () => {
    fetch('/scan/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(error => {
        console.log('failed updateStatus()', error) // eslint-disable-line no-console
      })
  }

  useInterval(() => {
    election && updateStatus()
    cardServerAvailable && !election && readCard()
  }, 1000)

  useEffect(updateStatus, [])

  if (election) {
    if (!status.electionHash) {
      configureServer(election)
    }
    return (
      <Screen>
        <Main>
          <MainChild maxWidth={false}>
            <DashboardScreen
              invalidateBranch={invalidateBranch}
              isScanning={isScanning}
              status={status}
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

  return <LoadElectionScreen setElection={uploadElection} />
}

export default App
