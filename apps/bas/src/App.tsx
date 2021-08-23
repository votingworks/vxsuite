import React, { useState } from 'react'
import {
  AnyCardData,
  AnyCardDataSchema,
  BallotStyle,
  ElectionSchema,
  safeParseElection,
  safeParseJSON,
  VoterCardData,
} from '@votingworks/types'
import { Card } from '@votingworks/utils'

import { EventTargetFunction } from './config/types'

import useStateWithLocalStorage from './hooks/useStateWithLocalStorage'

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
import { z } from 'zod'

let checkCardInterval = 0

export interface Props {
  card: Card
}

const App: React.FC<Props> = ({ card }) => {
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
  ] = useStateWithLocalStorage('singlePrecinctMode', z.boolean(), false)
  const [election, setElection] = useStateWithLocalStorage(
    'election',
    ElectionSchema
  )
  const [isLoadingElection, setIsLoadingElection] = useState(false)
  const [precinctId, setPrecinctId] = useStateWithLocalStorage(
    'precinctId',
    z.string()
  )
  const [ballotStyleId, setBallotStyleId] = useState<string>()
  const [partyId, setPartyId] = useStateWithLocalStorage('partyId', z.string())
  const [voterCardData, setVoterCardData] = useState<VoterCardData>()

  const unconfigure = () => {
    setElection(undefined)
    setBallotStyleId(undefined)
    setPrecinctId(undefined)
    setPartyId(undefined)
    setIsSinglePrecinctMode(false)
    window.localStorage.clear()
  }

  const reset = () => {
    if (!isSinglePrecinctMode) {
      setPrecinctId(undefined)
    }
    setBallotStyleId(undefined)
  }

  const setPrecinct = (id: string) => {
    setPrecinctId(id)
    setPartyId(undefined)
  }

  const updatePrecinct: EventTargetFunction = (event) => {
    const { id } = (event.target as HTMLElement).dataset
    setPrecinctId(id)
  }

  const setParty = (id: string) => {
    setPartyId(id)
  }

  // eslint-disable-next-line no-shadow
  const getPartyNameById = (partyId: string) => {
    const party = election?.parties.find((p) => p.id === partyId)
    return party?.name ?? ''
  }

  // eslint-disable-next-line no-shadow
  const getPartyAdjectiveById = (partyId: string) => {
    const partyName = getPartyNameById(partyId)
    return (partyName === 'Democrat' && 'Democratic') || partyName
  }

  // eslint-disable-next-line no-shadow
  const getPrecinctNameByPrecinctId = (precinctId: string): string => {
    const precinct = election?.precincts.find((p) => p.id === precinctId)
    return precinct?.name ?? ''
  }

  const getBallotStylesByPrecinctId = (id?: string): BallotStyle[] =>
    election?.ballotStyles.filter((b) => !id || b.precincts.includes(id)) ?? []

  const fetchElection = async () => {
    setIsLoadingElection(true)
    const longValue = await card.readLongString()
    setElection(safeParseElection(longValue).unsafeUnwrap())
    setIsLoadingElection(false)
  }

  const lockScreen = () => {
    setIsLocked(true)
  }

  const processCardData = (
    shortValue: AnyCardData,
    longValueExists = false
  ) => {
    setIsAdminCardPresent(false)
    setIsPollWorkerCardPresent(false)
    // eslint-disable-next-line no-shadow
    let isWritableCard = false
    switch (shortValue.t) {
      case 'voter':
        isWritableCard = true
        setVoterCardData(shortValue)
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
        const cardStatus = await card.readStatus()
        const currentCardDataString = JSON.stringify(cardStatus)
        if (currentCardDataString === lastCardDataString) {
          return
        }
        lastCardDataString = currentCardDataString

        setIsCardPresent(false)
        setIsAdminCardPresent(false)
        setIsPollWorkerCardPresent(false)
        setVoterCardData(undefined)

        if (cardStatus.present) {
          setIsCardPresent(true)
          if (cardStatus.shortValue) {
            const shortValueResult = safeParseJSON(
              cardStatus.shortValue,
              AnyCardDataSchema
            )
            if (shortValueResult.isOk()) {
              processCardData(shortValueResult.ok(), cardStatus.longValueExists)
            }
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

  const programCard: EventTargetFunction = async (event) => {
    const {
      ballotStyleId: localBallotStyleId,
    } = (event.target as HTMLElement).dataset
    if (precinctId && localBallotStyleId) {
      setBallotStyleId(localBallotStyleId)
      setIsEncodingCard(true)

      const createAtSeconds = Math.round(Date.now() / 1000)
      const code: VoterCardData = {
        c: createAtSeconds,
        t: 'voter',
        pr: precinctId,
        bs: localBallotStyleId,
      }
      try {
        await card.writeShortValue(JSON.stringify(code))
        window.setTimeout(() => {
          setIsEncodingCard(false)
          setIsReadyToRemove(true)
        }, 1500)
      } catch {
        window.setTimeout(() => {
          // TODO: UI Notification if unable to write to card
          // https://github.com/votingworks/bas/issues/10
          console.log(code) // eslint-disable-line no-console
          reset()
          setIsEncodingCard(false)
          setIsReadyToRemove(true)
        }, 500)
      }
    }
  }

  if (isAdminCardPresent) {
    return (
      <AdminScreen
        election={election}
        fetchElection={fetchElection}
        getBallotStylesByPrecinctId={getBallotStylesByPrecinctId}
        isLoadingElection={isLoadingElection}
        partyId={partyId}
        partyName={partyId && getPartyAdjectiveById(partyId)}
        precinctId={precinctId}
        precinctName={precinctId && getPrecinctNameByPrecinctId(precinctId)}
        setParty={setParty}
        setPrecinct={setPrecinct}
        unconfigure={unconfigure}
        isSinglePrecinctMode={isSinglePrecinctMode}
        setIsSinglePrecinctMode={setIsSinglePrecinctMode}
        precinctBallotStyles={getBallotStylesByPrecinctId(precinctId)}
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
    if (isReadyToRemove && ballotStyleId && precinctId) {
      return (
        <RemoveCardScreen
          ballotStyleId={ballotStyleId}
          lockScreen={lockScreen}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
        />
      )
    }
    if (isEncodingCard && ballotStyleId && precinctId) {
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
          isSinglePrecinctMode={isSinglePrecinctMode}
          lockScreen={lockScreen}
          partyId={partyId}
          precinctBallotStyles={getBallotStylesByPrecinctId(precinctId)}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
          programCard={programCard}
          showPrecincts={reset}
        />
      )
    }
    return (
      <PrecinctsScreen
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
