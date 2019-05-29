import React, { useCallback, useEffect, useState } from 'react'

import { ButtonEvent, CardData, OptionalElection } from './config/types'

import Button from './components/Button'
import Main, { MainChild } from './components/Main'
import MainNav from './components/MainNav'
import Screen from './components/Screen'
import Text from './components/Text'
import useStateAndLocalStorage from './hooks/useStateWithLocalStorage'

import PrecinctBallotStylesScreen from './screens/PrecinctBallotStylesScreen'
import LoadElectionScreen from './screens/LoadElectionScreen'
import PrecinctsScreen from './screens/PrecinctsScreen'

import 'normalize.css'
import './App.css'

let checkCardInterval = 0

const App: React.FC = () => {
  const [isProgrammingCard, setIsProgrammingCard] = useState(false)
  const [isWritableCard, setIsWritableCard] = useState(false)
  const [isClerkCardPresent, setIsClerkCardPresent] = useState(false)
  const [election, setElection] = useStateAndLocalStorage<OptionalElection>(
    'election'
  )
  const unsetElection = () => setElection(undefined)
  const [isLoadingElection, setIsLoadingElection] = useState(false)
  const [precinctId, setPrecinctId] = useState('')

  const fetchElection = async () => {
    setIsLoadingElection(true)
    return fetch('/card/read_long')
      .then(result => result.json())
      .then(resultJSON => JSON.parse(resultJSON.longValue))
      .then(election => {
        setElection(election)
        setIsLoadingElection(false)
      })
  }

  const processCardData = (cardData: CardData, longValueExists: boolean) => {
    setIsClerkCardPresent(false)
    let isWritableCard = false
    switch (cardData.t) {
      case 'voter':
        isWritableCard = true
        break
      case 'pollworker':
        break
      case 'clerk':
        if (longValueExists) {
          setIsClerkCardPresent(true)
        }
        break
      default:
        isWritableCard = true
        break
    }

    setIsWritableCard(isWritableCard)
  }

  if (!checkCardInterval) {
    checkCardInterval = window.setInterval(() => {
      fetch('/card/read')
        .then(result => result.json())
        .then(resultJSON => {
          if (resultJSON.present) {
            if (resultJSON.shortValue) {
              const cardData = JSON.parse(resultJSON.shortValue) as CardData
              processCardData(cardData, resultJSON.longValueExists)
            } else {
              // happy to overwrite a card with no data on it
              setIsWritableCard(true)
              setIsClerkCardPresent(false)
            }
          } else {
            // can't write if there's no card
            setIsWritableCard(false)
            setIsClerkCardPresent(false)
          }
        })
        .catch(() => {
          // if it's an error, aggressively assume there's no backend and stop hammering
          window.clearInterval(checkCardInterval)
        })
    }, 1000)
  }

  const updatePrecinct = (event: ButtonEvent) => {
    const { id = '' } = (event.target as HTMLElement).dataset
    setPrecinctId(id)
  }

  const getPrecinctNameByPrecinctId = (precinctId: string): string =>
    (election && election.precincts.find(p => p.id === precinctId)!.name) || ''

  const getBallotStylesByPreinctId = (id: string) =>
    (election &&
      election.ballotStyles.filter(b => b.precincts.find(p => p === id))) ||
    []

  const reset = () => {
    setPrecinctId('')
  }

  const programCard = (event: ButtonEvent) => {
    const ballotStyleId = (event.target as HTMLElement).dataset.ballotStyleId

    // eventually we want better UI, but for now,
    // let's not program a non-writable card
    if (!isWritableCard) {
      return
    }

    if (precinctId && ballotStyleId) {
      setIsProgrammingCard(true)

      const code = { t: 'voter', pr: `${precinctId}`, bs: `${ballotStyleId}` }
      fetch('/card/write', {
        method: 'post',
        body: JSON.stringify(code),
        headers: { 'Content-Type': 'application/json' },
      })
        .then(res => res.json())
        .then(response => {
          if (response.success) {
            // TODO: better notification of success
            // https://github.com/votingworks/bas/issues/7
            reset()

            // show some delay here for UI purposes
            window.setTimeout(() => {
              setIsProgrammingCard(false)
            }, 1000)
          }
        })
        .catch(() => {
          window.setTimeout(() => {
            // TODO: UI Notification if unable to write to card
            // https://github.com/votingworks/bas/issues/10
            console.log(code) // eslint-disable-line no-console
            reset()
            setIsProgrammingCard(false)
          }, 500)
        })
    }
  }

  const handleUserKeyPress = useCallback(event => {
    event.keyCode === 27 && reset()
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleUserKeyPress)
    return () => {
      window.removeEventListener('keydown', handleUserKeyPress)
    }
  }, [handleUserKeyPress])

  if (isClerkCardPresent) {
    return (
      <Screen>
        <Main>
          <MainChild>
            <h1>Configuration</h1>
            {isLoadingElection ? (
              <p>Loading Election Definition from Clerk Card…</p>
            ) : (
              <React.Fragment>
                <p>
                  <Text as="span" voteIcon={!!election} warningIcon={!election}>
                    {election ? (
                      'Election definition file is loaded.'
                    ) : (
                      <span>
                        Election definition file is <strong>not Loaded</strong>.
                      </span>
                    )}
                  </Text>
                </p>
                <p>
                  {election ? (
                    <Button onClick={unsetElection}>
                      Reset Election Definition
                    </Button>
                  ) : (
                    <Button onClick={fetchElection}>
                      Load Election Definition
                    </Button>
                  )}
                </p>
              </React.Fragment>
            )}
          </MainChild>
        </Main>
        <MainNav title="Clerk Actions" />
      </Screen>
    )
  } else if (election) {
    return (
      <Screen>
        <Main>
          {isProgrammingCard ? (
            <MainChild center>
              <h1>Programming card…</h1>
            </MainChild>
          ) : (
            <MainChild maxWidth={false}>
              {precinctId ? (
                <PrecinctBallotStylesScreen
                  precinctBallotStyles={getBallotStylesByPreinctId(precinctId)}
                  precinctName={getPrecinctNameByPrecinctId(precinctId)}
                  programCard={programCard}
                />
              ) : (
                <PrecinctsScreen
                  precincts={election.precincts}
                  updatePrecinct={updatePrecinct}
                />
              )}
            </MainChild>
          )}
        </Main>
        <MainNav>
          <Button disabled={!precinctId || isProgrammingCard} onClick={reset}>
            Precincts
          </Button>
        </MainNav>
      </Screen>
    )
  }

  return <LoadElectionScreen setElection={setElection} />
}

export default App
