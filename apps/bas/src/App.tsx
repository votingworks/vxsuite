import React, { useState } from 'react'
import {
  BallotStyle,
  CardData,
  Optional,
  OptionalElection,
  VoterCardData,
} from '@votingworks/types'

import fetchJSON from './utils/fetchJSON'

import { ButtonEvent, CardAPI } from './config/types'

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

const App: React.FC = () => {
  const [isEncodingCard, setIsEncodingCard] = useState(false)
  const [isWritableCard, setIsWritableCard] = useState(false)
  const [isCardPresent, setIsCardPresent] = useState(false)
  const [isAdminCardPresent, setIsAdminCardPresent] = useState(false)
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
  const [ballotStyleId, setBallotStyleId] = useState<string>('')
  const [partyId, setPartyId] = useStateAndLocalStorage<string>('partyId')
  const [voterCardData, setVoterCardData] = useState<Optional<VoterCardData>>(
    undefined
  )

  const unconfigure = () => {
    setElection(undefined)
    setBallotStyleId('')
    setPrecinctId('')
    setPartyId('')
    setIsSinglePrecinctMode(false)
    window.localStorage.clear()
  }

  const reset = () => {
    if (!isSinglePrecinctMode) {
      setPrecinctId('')
    }
    setBallotStyleId('')
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

  // eslint-disable-next-line no-shadow
  const getPartyNameById = (partyId: string) => {
    const party = election && election.parties.find((p) => p.id === partyId)
    return (party && party.name) || ''
  }

  // eslint-disable-next-line no-shadow
  const getPartyAdjectiveById = (partyId: string) => {
    const partyName = getPartyNameById(partyId)
    return (partyName === 'Democrat' && 'Democratic') || partyName
  }

  // eslint-disable-next-line no-shadow
  const getPrecinctNameByPrecinctId = (precinctId: string): string => {
    const precinct =
      election && election.precincts.find((p) => p.id === precinctId)
    return (precinct && precinct.name) || ''
  }

  const getBallotStylesByPreinctId = (id: string): BallotStyle[] =>
    (election &&
      election.ballotStyles.filter((b) => b.precincts.find((p) => p === id))) ||
    []

  const fetchElection = async () => {
    setIsLoadingElection(true)
    const { longValue } = await fetchJSON('/card/read_long')
    setElection(JSON.parse(longValue))
    setIsLoadingElection(false)
  }

  const lockScreen = () => {
    setIsLocked(true)
  }

  const processCardData = (shortValue: CardData, longValueExists = false) => {
    setIsAdminCardPresent(false)
    setIsPollWorkerCardPresent(false)
    // eslint-disable-next-line no-shadow
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
      case 'admin':
        if (longValueExists) {
          setIsAdminCardPresent(true)
          setIsLocked(true)
        }
        break
      default:
        isWritableCard = true
        break
    }

    setIsWritableCard(isWritableCard)
  }

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
        setIsAdminCardPresent(false)
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

  const programCard = (event: ButtonEvent) => {
    const {
      ballotStyleId: localBallotStyleId,
    } = (event.target as HTMLElement).dataset
    if (precinctId && localBallotStyleId) {
      setBallotStyleId(localBallotStyleId)
      setIsEncodingCard(true)

      const createAtSeconds = Math.round(Date.now() / 1000)
      const code = {
        c: createAtSeconds,
        t: 'voter',
        pr: precinctId,
        bs: localBallotStyleId,
      }
      fetch('/card/write', {
        method: 'post',
        body: JSON.stringify(code),
        headers: { 'Content-Type': 'application/json' },
      })
        .then((res) => res.json())
        .then((response) => {
          if (response.success) {
            window.setTimeout(() => {
              setIsEncodingCard(false)
              setIsReadyToRemove(true)
            }, 1500)
          }
        })
        .catch(() => {
          window.setTimeout(() => {
            // TODO: UI Notification if unable to write to card
            // https://github.com/votingworks/bas/issues/10
            console.log(code) // eslint-disable-line no-console
            reset()
            setIsEncodingCard(false)
            setIsReadyToRemove(true)
          }, 500)
        })
    }
  }

  const { bs = '', pr = '' } = voterCardData || {}
  const cardBallotStyleId = bs
  const cardPrecinctName = getPrecinctNameByPrecinctId(pr)

  if (isAdminCardPresent) {
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
  }
  if (election) {
    if (isPollWorkerCardPresent && !isLocked) {
      return <PollWorkerScreen lockScreen={lockScreen} />
    }
    if (isLocked) {
      return <LockedScreen />
    }
    if (!isCardPresent) {
      return <InsertCardScreen lockScreen={lockScreen} />
    }
    if (!isWritableCard) {
      return <NonWritableCardScreen lockScreen={lockScreen} />
    }
    if (isReadyToRemove) {
      return (
        <RemoveCardScreen
          ballotStyleId={ballotStyleId}
          lockScreen={lockScreen}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
        />
      )
    }
    if (isEncodingCard) {
      return (
        <WritingCardScreen
          ballotStyleId={ballotStyleId}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
        />
      )
    }
    if (precinctId) {
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
    }
    return (
      <PrecinctsScreen
        cardBallotStyleId={cardBallotStyleId}
        cardPrecinctName={cardPrecinctName}
        countyName={election.county.name}
        lockScreen={lockScreen}
        precincts={election.precincts}
        updatePrecinct={updatePrecinct}
        voterCardData={voterCardData}
      />
    )
  }
  return <LoadElectionScreen />
}

export default App
