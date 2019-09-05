import React, { useCallback, useEffect, useState } from 'react'

import {
  ButtonEvent,
  CardData,
  OptionalElection,
  OptionalVoterCardData,
  VoterCardData,
  BallotStyle,
} from './config/types'

import Button from './components/Button'
import CurrentVoterCard from './components/CurrentVoterCard'
import Main, { MainChild } from './components/Main'
import MainNav from './components/MainNav'
import Screen from './components/Screen'
import useStateAndLocalStorage from './hooks/useStateWithLocalStorage'

import AdminScreen from './screens/AdminScreen'
import PrecinctBallotStylesScreen from './screens/PrecinctBallotStylesScreen'
import LoadElectionScreen from './screens/LoadElectionScreen'
import LockedScreen from './screens/LockedScreen'
import PollWorkerScreen from './screens/PollWorkerScreen'
import PrecinctsScreen from './screens/PrecinctsScreen'

import 'normalize.css'
import './App.css'

let checkCardInterval = 0

const App = () => {
  const [isProgrammingCard, setIsProgrammingCard] = useState(false)
  const [isWritableCard, setIsWritableCard] = useState(false)
  const [isClerkCardPresent, setIsClerkCardPresent] = useState(false)
  const [isPollWorkerCardPresent, setIsPollWorkerCardPresent] = useState(false)
  const [isLocked, setIsLocked] = useState(true)
  const [
    isSinglePrecinctMode,
    setIsSinglePrecinctMode,
  ] = useStateAndLocalStorage<boolean>('singlePrecinctMode')
  const [election, setElection] = useStateAndLocalStorage<OptionalElection>(
    'election'
  )
  const [isLoadingElection, setIsLoadingElection] = useState(false)
  const [precinctId, setPrecinctId] = useStateAndLocalStorage<string>(
    'precinctId'
  )
  const [partyId, setPartyId] = useStateAndLocalStorage<string>('partyId')
  const [voterCardData, setVoterCardData] = useState<OptionalVoterCardData>(
    undefined
  )

  const unconfigure = () => {
    setElection(undefined)
    setPrecinctId('')
    setPartyId('')
    setIsSinglePrecinctMode(false)
    window.localStorage.clear()
  }

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
    setIsPollWorkerCardPresent(false)
    let isWritableCard = false
    switch (cardData.t) {
      case 'voter':
        isWritableCard = true
        setVoterCardData(cardData as VoterCardData)
        break
      case 'pollworker':
        setIsPollWorkerCardPresent(true)
        setIsLocked(false)
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

  // TODO: this needs a major refactor to remove duplication.
  if (!checkCardInterval) {
    let lastCardDataString = ''

    checkCardInterval = window.setInterval(() => {
      fetch('/card/read')
        .then(result => result.json())
        .then(card => {
          const currentCardDataString = JSON.stringify(card)
          if (currentCardDataString === lastCardDataString) {
            return
          }
          lastCardDataString = currentCardDataString

          if (card.present) {
            if (card.shortValue) {
              const cardData = JSON.parse(card.shortValue) as CardData
              processCardData(cardData, card.longValueExists)
            } else {
              // happy to overwrite a card with no data on it
              setIsWritableCard(true)
              setIsClerkCardPresent(false)
              setIsPollWorkerCardPresent(false)
              setVoterCardData(undefined)
            }
          } else {
            // can't write if there's no card
            setIsWritableCard(false)
            setIsClerkCardPresent(false)
            setIsPollWorkerCardPresent(false)
            setVoterCardData(undefined)
          }
        })
        .catch(() => {
          // if it's an error, aggressively assume there's no backend and stop hammering
          lastCardDataString = ''
          setIsClerkCardPresent(false)
          setIsPollWorkerCardPresent(false)
          setVoterCardData(undefined)
          window.clearInterval(checkCardInterval)
        })
    }, 1000)
  }

  const setPrecinct = (id: string) => {
    setPrecinctId(id)
    setPartyId('')
  }

  const updatePrecinct = (event: ButtonEvent) => {
    const { id = '' } = (event.target as HTMLElement).dataset
    setPrecinctId(id)
  }

  const setParty = (id: string) => {
    setPartyId(id)
  }

  const getPartyNameById = (partyId: string) => {
    const party = election && election.parties.find(p => p.id === partyId)
    return (party && party.name) || ''
  }

  const getPartyAdjectiveById = (partyId: string) => {
    const partyName = getPartyNameById(partyId)
    return (partyName === 'Democrat' && 'Democratic') || partyName
  }

  const getPrecinctNameByPrecinctId = (precinctId: string): string => {
    const precinct =
      election && election.precincts.find(p => p.id === precinctId)
    return (precinct && precinct.name) || ''
  }

  const getBallotStylesByPreinctId = (id: string): BallotStyle[] =>
    (election &&
      election.ballotStyles.filter(b => b.precincts.find(p => p === id))) ||
    []

  const reset = useCallback(() => {
    if (!isSinglePrecinctMode) {
      setPrecinctId('')
    }
  }, [setPrecinctId, isSinglePrecinctMode])

  const programCard = (event: ButtonEvent) => {
    const ballotStyleId = (event.target as HTMLElement).dataset.ballotStyleId

    // eventually we want better UI, but for now,
    // let's not program a non-writable card
    if (!isWritableCard) {
      return
    }

    if (precinctId && ballotStyleId) {
      setIsProgrammingCard(true)

      const createAtSeconds = Date.now() / 1000
      const code = {
        c: createAtSeconds,
        t: 'voter',
        pr: precinctId,
        bs: ballotStyleId,
      }
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

  const handleUserKeyPress = useCallback(
    event => {
      event.keyCode === 27 && reset()
    },
    [reset]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleUserKeyPress)
    return () => {
      window.removeEventListener('keydown', handleUserKeyPress)
    }
  }, [handleUserKeyPress])

  if (isClerkCardPresent) {
    return (
      <AdminScreen
        election={election}
        fetchElection={fetchElection}
        getBallotStylesByPreinctId={getBallotStylesByPreinctId}
        isLoadingElection={isLoadingElection}
        partyId={partyId}
        partyName={getPartyAdjectiveById(partyId)}
        precinctId={precinctId}
        precinctName={getPrecinctNameByPrecinctId(precinctId)}
        setParty={setParty}
        setPrecinct={setPrecinct}
        unconfigure={unconfigure}
        isSinglePrecinctMode={isSinglePrecinctMode}
        setIsSinglePrecinctMode={setIsSinglePrecinctMode}
        precinctBallotStyles={getBallotStylesByPreinctId(precinctId)}
      />
    )
  } else if (isPollWorkerCardPresent) {
    return <PollWorkerScreen />
  } else if (election) {
    if (isLocked) {
      return <LockedScreen />
    } else {
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
                    isSinglePrecinctMode={isSinglePrecinctMode}
                    partyId={partyId}
                    precinctBallotStyles={getBallotStylesByPreinctId(
                      precinctId
                    )}
                    precinctName={getPrecinctNameByPrecinctId(precinctId)}
                    programCard={programCard}
                    showPrecincts={reset}
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
            <Button
              onClick={() => {
                setIsLocked(true)
              }}
            >
              Lock
            </Button>
          </MainNav>
          {!isProgrammingCard && voterCardData && (
            <CurrentVoterCard
              ballotStyleId={voterCardData.bs}
              precinctName={getPrecinctNameByPrecinctId(voterCardData.pr)}
            />
          )}
        </Screen>
      )
    }
  }

  return <LoadElectionScreen setElection={setElection} />
}

export default App
