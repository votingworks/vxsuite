import React, { useState } from 'react'

import { ButtonEvent, CardData, OptionalElection } from './config/types'

import Brand from './components/Brand'
import Button from './components/Button'
import ButtonBar from './components/ButtonBar'
import Main, { MainChild } from './components/Main'
import Screen from './components/Screen'
import useStateAndLocalStorage from './hooks/useStateWithLocalStorage'

import LoadElectionScreen from './screens/LoadElectionScreen'
import DashboardScreen from './screens/DashboardScreen'

import 'normalize.css'
import './App.css'

let checkCardInterval = 0

let loadingElection = false

const App: React.FC = () => {
  const [isProgrammingCard, setIsProgrammingCard] = useState(false)
  const [election, setElection] = useStateAndLocalStorage<OptionalElection>(
    'election'
  )

  const programCard = (event: ButtonEvent) => {
    const id = (event.target as HTMLElement).dataset.id
    setIsProgrammingCard(id === 'admin')
  }

  const fetchElection = async () => {
    return fetch('/card/read_long')
      .then(result => result.json())
      .then(resultJSON => JSON.parse(resultJSON.longValue))
  }

  const processCardData = (cardData: CardData, longValueExists: boolean) => {
    if (cardData.t === 'admin') {
      if (!election) {
        if (longValueExists && !loadingElection) {
          loadingElection = true
          fetchElection().then(election => {
            setElection(election)
            loadingElection = false
          })
        }
      }
    }
  }

  if (!checkCardInterval) {
    checkCardInterval = window.setInterval(() => {
      fetch('/card/read')
        .then(result => result.json())
        .then(resultJSON => {
          if (resultJSON.shortValue) {
            const cardData = JSON.parse(resultJSON.shortValue) as CardData
            processCardData(cardData, resultJSON.longValueExists)
          }
        })
        .catch(() => {
          window.clearInterval(checkCardInterval)
        })
    }, 1000)
  }

  if (election) {
    return (
      <Screen>
        <Main>
          {isProgrammingCard ? (
            <MainChild center>
              <h1>Programming card…</h1>
            </MainChild>
          ) : (
            <MainChild maxWidth={false}>
              <DashboardScreen programCard={programCard} />
            </MainChild>
          )}
        </Main>
        <ButtonBar secondary naturalOrder separatePrimaryButton>
          <Brand>VxScanner</Brand>
          <Button>Zero</Button>
          <Button>Export</Button>
          <Button primary>Scan New Batch</Button>
        </ButtonBar>
      </Screen>
    )
  }

  return <LoadElectionScreen setElection={setElection} />
}

export default App
