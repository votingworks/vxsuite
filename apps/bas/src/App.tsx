import React, { useCallback, useEffect, useState } from 'react'

import fetchJSON from './utils/fetchJSON'

import {
  ButtonEvent,
  CardData,
  OptionalElection,
  OptionalVoterCardData,
  VoterCardData,
  BallotStyle,
  CardAPI,
} from './config/types'

import useStateAndLocalStorage from './hooks/useStateWithLocalStorage'

import AdminScreen from './screens/AdminScreen'
import InsertCardScreen from './screens/InsertCardScreen'
import LoadElectionScreen from './screens/LoadElectionScreen'
import LockedScreen from './screens/LockedScreen'
import NonWritableCardScreen from './screens/NonWritableCardScreen'
import PollWorkerScreen from './screens/PollWorkerScreen'
import PrecinctBallotStylesScreen from './screens/PrecinctBallotStylesScreen'
import PrecinctsScreen from './screens/PrecinctsScreen'
import RemoveCardScreen from './screens/RemoveCardScreen'
import WritingCardScreen from './screens/WritingCardScreen'

import 'normalize.css'
import './App.css'

let checkCardInterval = 0

const App = () => {
  const [isProgrammingCard, setIsProgrammingCard] = useState(false)
  const [isWritableCard, setIsWritableCard] = useState(false)
  const [isCardPresent, setIsCardPresent] = useState(false)
  const [isClerkCardPresent, setIsClerkCardPresent] = useState(false)
  const [isPollWorkerCardPresent, setIsPollWorkerCardPresent] = useState(false)
  const [isLocked, setIsLocked] = useState(true)
  const [isReadyToRemove, setIsReadyToRemove] = useState(false)
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
    const { longValue } = await fetchJSON('/card/read_long')
    const election = JSON.parse(longValue)
    setElection(election)
    setIsLoadingElection(false)
  }

  const processCardData = (
    shortValue: CardData,
    longValueExists: boolean = false
  ) => {
    setIsClerkCardPresent(false)
    setIsPollWorkerCardPresent(false)
    let isWritableCard = false
    switch (shortValue.t) {
      case 'voter':
        isWritableCard = true
        setVoterCardData(shortValue as VoterCardData)
        break
      case 'pollworker':
        setIsPollWorkerCardPresent(true)
        setIsLocked(false)
        break
      case 'clerk':
        if (longValueExists) {
          setIsClerkCardPresent(true)
          setIsLocked(true)
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

    checkCardInterval = window.setInterval(async () => {
      try {
        const card = await fetchJSON<CardAPI>('/card/read')
        const currentCardDataString = JSON.stringify(card)
        if (currentCardDataString === lastCardDataString) {
          return
        }
        lastCardDataString = currentCardDataString

        setIsCardPresent(false)
        setIsClerkCardPresent(false)
        setIsPollWorkerCardPresent(false)
        setVoterCardData(undefined)

        if (card.present) {
          setIsCardPresent(true)
          if (card.shortValue) {
            const shortValue = JSON.parse(card.shortValue) as CardData
            processCardData(shortValue, card.longValueExists)
          } else {
            setIsWritableCard(true)
          }
        } else {
          setIsWritableCard(false)
          setIsReadyToRemove(false)
        }
      } catch (error) {
        // if it's an error, aggressively assume there's no backend and stop hammering
        lastCardDataString = ''
        window.clearInterval(checkCardInterval)
      }
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
    if (precinctId && ballotStyleId) {
      setIsProgrammingCard(true)

      const createAtSeconds = Math.round(Date.now() / 1000)
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
              setIsReadyToRemove(true)
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
            setIsReadyToRemove(true)
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

  const lockScreen = () => {
    setIsLocked(true)
  }

  const { bs = '', pr = '' } = voterCardData || {}
  const cardBallotStyleId = bs
  const cardPrecinctName = getPrecinctNameByPrecinctId(pr)

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
  } else if (election) {
    if (isPollWorkerCardPresent && !isLocked) {
      return <PollWorkerScreen lockScreen={lockScreen} />
    } else if (isLocked) {
      return <LockedScreen />
    } else if (!isCardPresent) {
      return <InsertCardScreen lockScreen={lockScreen} />
    } else if (!isWritableCard) {
      return <NonWritableCardScreen lockScreen={lockScreen} />
    } else if (isReadyToRemove) {
      return <RemoveCardScreen lockScreen={lockScreen} />
    } else if (isProgrammingCard) {
      return <WritingCardScreen />
    } else if (precinctId) {
      return (
        <PrecinctBallotStylesScreen
          cardBallotStyleId={cardBallotStyleId}
          cardPrecinctName={cardPrecinctName}
          isSinglePrecinctMode={isSinglePrecinctMode}
          lockScreen={lockScreen}
          partyId={partyId}
          precinctBallotStyles={getBallotStylesByPreinctId(precinctId)}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
          programCard={programCard}
          showPrecincts={reset}
        />
      )
    } else {
      return (
        <PrecinctsScreen
          cardBallotStyleId={cardBallotStyleId}
          cardPrecinctName={cardPrecinctName}
          lockScreen={lockScreen}
          precincts={election.precincts}
          updatePrecinct={updatePrecinct}
          voterCardData={voterCardData}
        />
      )
    }
  } else {
    return <LoadElectionScreen setElection={setElection} />
  }
}

export default App
