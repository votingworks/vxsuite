/* eslint-disable no-shadow */
import {
  CompletedBallot,
  decodeBallot,
  encodeBallot,
  getPrecinctById,
  BallotType,
  CandidateVote,
  YesNoVote,
  OptionalVote,
  VotesDict,
  Contests,
  Election,
  ElectionDefinition,
  OptionalElectionDefinition,
} from '@votingworks/ballot-encoder'
import 'normalize.css'
import React, { useCallback, useEffect, useReducer } from 'react'
import Gamepad from 'react-gamepad'
import { RouteComponentProps } from 'react-router-dom'
import './App.css'
import IdleTimer from 'react-idle-timer'
import { sha256 } from 'js-sha256'
import { map } from 'rxjs/operators'
import useInterval from '@rooks/use-interval'

import Ballot from './components/Ballot'
import * as GLOBALS from './config/globals'
import {
  CardAPI,
  CardData,
  CardPresentAPI,
  MarkVoterCardFunction,
  PartialUserSettings,
  UserSettings,
  VoterCardData,
  VxMarkOnly,
  Tally,
  CandidateVoteTally,
  YesNoVoteTally,
  SerializableActivationData,
  Provider,
  MachineConfig,
} from './config/types'
import BallotContext from './contexts/ballotContext'
import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad'
import CastBallotPage from './pages/CastBallotPage'
import AdminScreen from './pages/AdminScreen'
import ExpiredCardScreen from './pages/ExpiredCardScreen'
import InsertCardScreen from './pages/InsertCardScreen'
import PollWorkerScreen from './pages/PollWorkerScreen'
import PrintOnlyScreen from './pages/PrintOnlyScreen'
import SetupCardReaderPage from './pages/SetupCardReaderPage'
import SetupPrinterPage from './pages/SetupPrinterPage'
import SetupPowerPage from './pages/SetupPowerPage'
import UnconfiguredScreen from './pages/UnconfiguredScreen'
import UsedCardScreen from './pages/UsedCardScreen'
import WrongElectionScreen from './pages/WrongElectionScreen'
import WrongPrecinctScreen from './pages/WrongPrecinctScreen'
import { getBallotStyle, getContests, getZeroTally } from './utils/election'
import { computeTallyForEitherNeitherContests } from './utils/eitherNeither'
import { Printer } from './utils/printer'
import utcTimestamp from './utils/utcTimestamp'
import { Card } from './utils/Card'
import { Storage } from './utils/Storage'
import {
  Hardware,
  isAccessibleController,
  isCardReader,
} from './utils/Hardware'
import { getSingleYesNoVote } from './utils/votes'

interface CardState {
  isAdminCardPresent: boolean
  isPollWorkerCardPresent: boolean
  isRecentVoterPrint: boolean
  isVoterCardExpired: boolean
  isVoterCardVoided: boolean
  isVoterCardPresent: boolean
  isVoterCardPrinted: boolean
  isVoterCardValid: boolean
  pauseProcessingUntilNoCardPresent: boolean
  voterCardCreatedAt: number
}

interface UserState {
  ballotCreatedAt: number
  ballotStyleId: string
  contests: Contests
  precinctId: string
  shortValue?: string
  userSettings: UserSettings
  votes?: VotesDict
}

interface HardwareState {
  hasAccessibleControllerAttached: boolean
  hasCardReaderAttached: boolean
  hasChargerAttached: boolean
  hasLowBattery: boolean
  hasPrinterAttached: boolean
  machineConfig: Readonly<MachineConfig>
}

interface SharedState {
  appPrecinctId: string
  ballotsPrintedCount: number
  electionDefinition: OptionalElectionDefinition
  isLiveMode: boolean
  isPollsOpen: boolean
  tally: Tally
}

interface OtherState {
  lastVoteUpdateAt: number
  lastVoteSaveToCardAt: number
  forceSaveVoteFlag: boolean
  writingVoteToCard: boolean
  lastCardDataString: string
}

export interface InitialUserState extends CardState, UserState, SharedState {}

export interface State extends InitialUserState, HardwareState, OtherState {}

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  state?: Partial<State>
  activation?: SerializableActivationData
  votes?: VotesDict
}

export interface Props extends RouteComponentProps {
  card: Card
  hardware: Hardware
  machineConfig: Provider<MachineConfig>
  printer: Printer
  storage: Storage<AppStorage>
}

export const electionStorageKey = 'electionDefinition'
export const stateStorageKey = 'state'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'
export const blankBallotVotes = {}

const initialCardState: Readonly<CardState> = {
  isAdminCardPresent: false,
  isPollWorkerCardPresent: false,
  isRecentVoterPrint: false,
  isVoterCardExpired: false,
  isVoterCardVoided: false,
  isVoterCardPresent: false,
  isVoterCardPrinted: false,
  isVoterCardValid: true,
  pauseProcessingUntilNoCardPresent: false,
  voterCardCreatedAt: 0,
}

const initialVoterState: UserState = {
  ballotCreatedAt: 0,
  ballotStyleId: '',
  contests: [],
  precinctId: '',
  shortValue: '{}',
  userSettings: { textSize: GLOBALS.TEXT_SIZE },
  votes: undefined,
}

const initialHardwareState: HardwareState = {
  hasAccessibleControllerAttached: false,
  hasCardReaderAttached: true,
  hasChargerAttached: true,
  hasLowBattery: false,
  hasPrinterAttached: true,
  machineConfig: { appMode: VxMarkOnly, machineId: '0000' },
}

const initialSharedState: SharedState = {
  appPrecinctId: '',
  ballotsPrintedCount: 0,
  electionDefinition: undefined,
  isLiveMode: false,
  isPollsOpen: false,
  tally: [],
}

const initialOtherState: OtherState = {
  lastVoteUpdateAt: 0,
  lastVoteSaveToCardAt: 0,
  forceSaveVoteFlag: false,
  writingVoteToCard: false,
  lastCardDataString: '',
}

const initialUserState: InitialUserState = {
  ...initialVoterState,
  ...initialCardState,
  ...initialSharedState,
}

const initialAppState: State = {
  ...initialUserState,
  ...initialHardwareState,
  ...initialOtherState,
}

// TODO: Move this function to another file and rewrite in FP.
const calculateTally = ({
  election,
  tally: prevTally,
  votes,
}: {
  election: Election
  tally: Tally
  votes: VotesDict
}) => {
  // first update the tally for either-neither contests
  const {
    tally,
    contestIds: eitherNeitherContestIds,
  } = computeTallyForEitherNeitherContests({
    election,
    tally: prevTally,
    votes,
  })

  for (const contestId in votes) {
    if (eitherNeitherContestIds.includes(contestId)) {
      continue
    }

    const contestIndex = election.contests.findIndex((c) => c.id === contestId)
    /* istanbul ignore next */
    if (contestIndex < 0) {
      throw new Error(`No contest found for contestId: ${contestId}`)
    }
    const contestTally = tally[contestIndex]
    const contest = election.contests[contestIndex]
    /* istanbul ignore else */
    if (contest.type === 'yesno') {
      const yesnoContestTally = contestTally as YesNoVoteTally
      const vote = votes[contestId] as YesNoVote
      yesnoContestTally[getSingleYesNoVote(vote)!]++
    } else if (contest.type === 'candidate') {
      const candidateContestTally = contestTally as CandidateVoteTally
      const vote = votes[contestId] as CandidateVote
      vote.forEach((candidate) => {
        if (candidate.isWriteIn) {
          const tallyContestWriteIns = candidateContestTally.writeIns
          const writeIn = tallyContestWriteIns.find(
            (c) => c.name === candidate.name
          )
          if (typeof writeIn === 'undefined') {
            tallyContestWriteIns.push({
              name: candidate.name,
              tally: 1,
            })
          } else {
            writeIn.tally++
          }
        } else {
          const candidateIndex = contest.candidates.findIndex(
            (c) => c.id === candidate.id
          )
          if (
            candidateIndex < 0 ||
            candidateIndex >= candidateContestTally.candidates.length
          ) {
            throw new Error(
              `unable to find a candidate with id: ${candidate.id}`
            )
          }
          candidateContestTally.candidates[candidateIndex]++
        }
      })
    }
  }
  return tally
}

// Sets State. All side effects done outside: storage, fetching, etc
type AppAction =
  | { type: 'processAdminCard' }
  | { type: 'processPollWorkerCard' }
  | { type: 'processVoterCard'; voterState: Partial<InitialUserState> }
  | { type: 'pauseCardProcessing' }
  | { type: 'resumeCardProcessing' }
  | { type: 'setMachineConfig'; machineConfig: MachineConfig }
  | { type: 'updateLastVoteUpdateAt'; date: number }
  | { type: 'unconfigure' }
  | { type: 'updateVote'; contestId: string; vote: OptionalVote }
  | { type: 'forceSaveVote' }
  | { type: 'resetBallot' }
  | { type: 'setUserSettings'; userSettings: PartialUserSettings }
  | { type: 'updateAppPrecinctId'; appPrecinctId: string }
  | { type: 'enableLiveMode' }
  | { type: 'toggleLiveMode' }
  | { type: 'togglePollsOpen' }
  | { type: 'updateTally' }
  | { type: 'updateElectionDefinition'; electionDefinition: ElectionDefinition }
  | { type: 'startWritingLongValue' }
  | { type: 'finishWritingLongValue' }
  | { type: 'updateHardwareState'; hardwareState: Partial<HardwareState> }
  | { type: 'initializeAppState'; appState: Partial<State> }
  | { type: 'updateLastCardDataString'; currentCardDataString: string }

const appReducer = (state: State, action: AppAction): State => {
  const resetTally = {
    ballotsPrintedCount: initialAppState.ballotsPrintedCount,
    tally: state.electionDefinition?.election
      ? getZeroTally(state.electionDefinition.election)
      : [],
  }
  switch (action.type) {
    case 'processAdminCard':
      return {
        ...state,
        ...initialCardState,
        isAdminCardPresent: true,
      }
    case 'processPollWorkerCard':
      return {
        ...state,
        ...initialCardState,
        isPollWorkerCardPresent: true,
      }
    case 'processVoterCard':
      return {
        ...state,
        ...initialCardState,
        ...action.voterState,
        isVoterCardExpired:
          state.voterCardCreatedAt === 0 &&
          utcTimestamp() >=
            action.voterState.voterCardCreatedAt! +
              GLOBALS.CARD_EXPIRATION_SECONDS,
      }
    case 'pauseCardProcessing':
      return {
        ...state,
        pauseProcessingUntilNoCardPresent: true,
      }
    case 'resumeCardProcessing':
      return {
        ...state,
        pauseProcessingUntilNoCardPresent: false,
      }
    case 'setMachineConfig':
      return {
        ...state,
        machineConfig:
          action.machineConfig ?? initialHardwareState.machineConfig,
      }
    case 'updateLastVoteUpdateAt':
      return {
        ...state,
        lastVoteUpdateAt: action.date,
      }
    case 'unconfigure':
      return {
        ...state,
        ...initialUserState,
      }
    case 'updateVote': {
      return {
        ...state,
        votes: {
          ...state.votes,
          [action.contestId]: action.vote,
        },
      }
    }
    case 'forceSaveVote':
      return {
        ...state,
        forceSaveVoteFlag: true,
      }
    case 'resetBallot':
      return {
        ...state,
        ...initialCardState,
        ...initialVoterState,
      }
    case 'setUserSettings':
      /* istanbul ignore next */
      if (Object.keys(action.userSettings).join(',') !== 'textSize') {
        throw new Error('unknown userSetting key')
      }
      if (action.userSettings.textSize === state.userSettings.textSize) {
        return state
      }
      return {
        ...state,
        userSettings: {
          ...state.userSettings,
          ...action.userSettings,
        },
      }
    case 'updateAppPrecinctId':
      return {
        ...state,
        ...resetTally,
        appPrecinctId: action.appPrecinctId,
      }
    case 'enableLiveMode':
      return {
        ...state,
        ...resetTally,
        isLiveMode: true,
        isPollsOpen: initialAppState.isPollsOpen,
      }
    case 'toggleLiveMode':
      return {
        ...state,
        ...resetTally,
        isLiveMode: !state.isLiveMode,
        isPollsOpen: initialAppState.isPollsOpen,
      }
    case 'togglePollsOpen':
      return {
        ...state,
        isPollsOpen: !state.isPollsOpen,
      }
    case 'updateTally': {
      const { electionDefinition, tally, votes } = state
      return {
        ...state,
        ballotsPrintedCount: state.ballotsPrintedCount + 1,
        tally: calculateTally({
          election: electionDefinition!.election,
          tally,
          votes: votes!,
        }),
      }
    }
    case 'updateElectionDefinition':
      return {
        ...state,
        electionDefinition: action.electionDefinition,
      }
    case 'startWritingLongValue':
      return {
        ...state,
        writingVoteToCard: true,
        forceSaveVoteFlag: false,
        lastVoteSaveToCardAt: Date.now(),
      }
    case 'finishWritingLongValue':
      return {
        ...state,
        writingVoteToCard: false,
      }
    case 'updateHardwareState':
      return {
        ...state,
        ...action.hardwareState,
      }
    case 'initializeAppState':
      return {
        ...state,
        ...action.appState,
      }
    case 'updateLastCardDataString': {
      return {
        ...state,
        lastCardDataString: action.currentCardDataString,
      }
    }
  }
}

const AppRoot: React.FC<Props> = ({
  card,
  hardware,
  history,
  machineConfig: machineConfigProvider,
  printer,
  storage,
}) => {
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState)
  const {
    appPrecinctId,
    ballotsPrintedCount,
    ballotStyleId,
    contests,
    electionDefinition: optionalElectionDefinition,
    isAdminCardPresent,
    isLiveMode,
    isPollsOpen,
    isPollWorkerCardPresent,
    isVoterCardPresent,
    isVoterCardExpired,
    isVoterCardVoided,
    isVoterCardPrinted,
    isVoterCardValid,
    isRecentVoterPrint,
    lastCardDataString,
    machineConfig,
    pauseProcessingUntilNoCardPresent,
    hasAccessibleControllerAttached,
    hasCardReaderAttached,
    hasChargerAttached,
    hasLowBattery,
    hasPrinterAttached,
    precinctId,
    shortValue,
    tally,
    userSettings,
    votes,
    voterCardCreatedAt,
  } = appState
  const { appMode } = machineConfig
  const { textSize: userSettingsTextSize } = userSettings

  const readCard = useCallback(async (): Promise<CardAPI> => {
    return await card.readStatus()
  }, [card])

  const writeCard = useCallback(
    async (cardData: VoterCardData) => {
      await card.writeShortValue(JSON.stringify(cardData))
    },
    [card]
  )

  // Handle Storing Election Locally
  useEffect(() => {
    const storeElection = (electionDefinition: ElectionDefinition) => {
      storage.set(electionStorageKey, electionDefinition)
    }
    if (optionalElectionDefinition) {
      storeElection(optionalElectionDefinition)
    }
  }, [optionalElectionDefinition, storage])

  // Handle Ballot Activation
  useEffect(() => {
    const storeBallotActivation = (data: SerializableActivationData) => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        storage.set(activationStorageKey, data)
      }
    }

    if (precinctId && ballotStyleId) {
      storeBallotActivation({
        ballotCreatedAt: voterCardCreatedAt,
        precinctId,
        ballotStyleId,
      })
    }
  }, [precinctId, ballotStyleId, voterCardCreatedAt, storage])

  // Handle Vote Updated (and store votes locally in !production)
  useEffect(() => {
    const storeVotes = async (votes: VotesDict) => {
      const storedVotes = storage.get(votesStorageKey) || blankBallotVotes
      if (JSON.stringify(storedVotes) !== JSON.stringify(votes)) {
        /* istanbul ignore else */
        if (process.env.NODE_ENV !== 'production') {
          storage.set(votesStorageKey, votes)
        }

        dispatchAppState({ type: 'updateLastVoteUpdateAt', date: Date.now() })
      }
    }
    if (votes) {
      storeVotes(votes)
    }
  }, [votes, storage])

  const resetBallot = useCallback(
    (path = '/') => {
      storage.remove(activationStorageKey)
      storage.remove(votesStorageKey)
      dispatchAppState({ type: 'resetBallot' })
      history.push(path)
    },
    [storage, history]
  )

  const unconfigure = useCallback(() => {
    dispatchAppState({ type: 'unconfigure' })
    storage.clear()
    history.push('/')
  }, [storage, history])

  const updateVote = useCallback((contestId: string, vote: OptionalVote) => {
    dispatchAppState({ type: 'updateVote', contestId, vote })
  }, [])

  const forceSaveVote = useCallback(() => {
    dispatchAppState({ type: 'forceSaveVote' })
  }, [])

  const setUserSettings = useCallback((userSettings: PartialUserSettings) => {
    dispatchAppState({ type: 'setUserSettings', userSettings })
  }, [])

  const useEffectToggleLargeDisplay = useCallback(() => {
    setUserSettings({ textSize: GLOBALS.LARGE_DISPLAY_FONT_SIZE })
    return () => {
      setUserSettings({ textSize: GLOBALS.DEFAULT_FONT_SIZE })
    }
  }, [setUserSettings])

  // Handle Changes to UserSettings
  useEffect(() => {
    document.documentElement.style.fontSize = `${GLOBALS.FONT_SIZES[userSettingsTextSize]}px`
    // Trigger application of “See More” buttons based upon scroll-port.
    window.dispatchEvent(new Event('resize'))
  }, [userSettingsTextSize])

  const updateAppPrecinctId = useCallback((appPrecinctId: string) => {
    dispatchAppState({
      type: 'updateAppPrecinctId',
      appPrecinctId,
    })
  }, [])

  const enableLiveMode = useCallback(() => {
    dispatchAppState({ type: 'enableLiveMode' })
  }, [])

  const toggleLiveMode = useCallback(() => {
    dispatchAppState({ type: 'toggleLiveMode' })
  }, [])

  const togglePollsOpen = useCallback(() => {
    dispatchAppState({ type: 'togglePollsOpen' })
  }, [])

  const updateTally = useCallback(() => {
    dispatchAppState({ type: 'updateTally' })
  }, [])

  const fetchElection = useCallback(async () => {
    const electionData = await card.readLongString()
    /* istanbul ignore else */
    if (electionData) {
      dispatchAppState({
        type: 'updateElectionDefinition',
        electionDefinition: {
          election: JSON.parse(electionData),
          electionHash: sha256(electionData),
        },
      })
    }
  }, [card])

  const processCard = useCallback(
    async ({ longValueExists, shortValue: cardShortValue }: CardPresentAPI) => {
      const cardData: CardData = JSON.parse(cardShortValue!)
      switch (cardData.t) {
        case 'voter': {
          const voterCardData = cardData as VoterCardData
          const isVoterCardVoided = Boolean(voterCardData.uz)
          const ballotPrintedTime = voterCardData.bp
            ? Number(voterCardData.bp)
            : 0
          const isVoterCardPrinted = Boolean(ballotPrintedTime)
          const isRecentVoterPrint =
            isVoterCardPrinted &&
            utcTimestamp() <=
              ballotPrintedTime + GLOBALS.RECENT_PRINT_EXPIRATION_SECONDS
          const ballotStyle = getBallotStyle({
            election: optionalElectionDefinition!.election,
            ballotStyleId: voterCardData.bs,
          })
          const precinct = getPrecinctById({
            election: optionalElectionDefinition!.election,
            precinctId: voterCardData.pr,
          })
          const isVoterCardValid = Boolean(ballotStyle) && Boolean(precinct)

          const fetchBallotData = async () => {
            const longValue = (await card.readLongUint8Array())!
            const { ballot } = decodeBallot(
              optionalElectionDefinition!.election,
              longValue
            )
            return ballot
          }

          const ballot: Partial<CompletedBallot> =
            (longValueExists &&
              isVoterCardValid &&
              !isVoterCardVoided &&
              !isVoterCardPrinted &&
              (await fetchBallotData())) ||
            {}

          dispatchAppState({
            type: 'processVoterCard',
            voterState: {
              shortValue: cardShortValue,
              isVoterCardVoided,
              isVoterCardPresent: true,
              isVoterCardPrinted,
              isRecentVoterPrint,
              isVoterCardValid,
              voterCardCreatedAt: voterCardData.c,
              ballotStyleId: ballotStyle?.id ?? initialAppState.ballotStyleId,
              precinctId: precinct?.id ?? initialAppState.precinctId,
              votes: ballot.votes,
              contests:
                ballotStyle && optionalElectionDefinition
                  ? getContests({
                      ballotStyle,
                      election: optionalElectionDefinition.election,
                    })
                  : initialAppState.contests,
            },
          })

          break
        }
        case 'pollworker': {
          dispatchAppState({ type: 'processPollWorkerCard' })
          break
        }
        case 'admin': {
          /* istanbul ignore else */
          if (longValueExists) {
            dispatchAppState({ type: 'processAdminCard' })
          }
          break
        }
      }
    },
    [card, optionalElectionDefinition]
  )

  const [
    startCardShortValueReadPolling,
    stopCardShortValueReadPolling,
  ] = useCallback(
    useInterval(async () => {
      const insertedCard = await card.readStatus()
      if (pauseProcessingUntilNoCardPresent) {
        if (insertedCard.present) {
          return
        }
        dispatchAppState({ type: 'resumeCardProcessing' })
      }

      // we compare last card and current card without the longValuePresent flag
      // otherwise when we first write the ballot to the card, it reprocesses it
      // and may cause a race condition where an old ballot on the card
      // overwrites a newer one in memory.
      //
      // TODO: embed a card dip UUID in the card data string so even an unlikely
      // identical card swap within 200ms is always detected.
      // https://github.com/votingworks/module-smartcards/issues/59
      const cardCopy = {
        ...insertedCard,
        longValueExists: undefined, // override longValueExists (see above comment)
      }
      const currentCardDataString = JSON.stringify(cardCopy)
      if (currentCardDataString === lastCardDataString) {
        return
      }
      dispatchAppState({
        type: 'updateLastCardDataString',
        currentCardDataString,
      })

      if (!insertedCard.present || !insertedCard.shortValue) {
        resetBallot()
        return
      }

      processCard(insertedCard)
    }, GLOBALS.CARD_POLLING_INTERVAL),
    [card]
  )

  const [startLongValueWritePolling] = useCallback(
    useInterval(async () => {
      if (
        appState.isVoterCardPresent &&
        appState.ballotStyleId &&
        appState.precinctId &&
        ((appState.lastVoteSaveToCardAt < appState.lastVoteUpdateAt &&
          appState.lastVoteUpdateAt <
            Date.now() - GLOBALS.CARD_LONG_VALUE_WRITE_DELAY) ||
          appState.forceSaveVoteFlag) &&
        !appState.writingVoteToCard
      ) {
        dispatchAppState({ type: 'startWritingLongValue' })
        const { election } = appState.electionDefinition!
        const ballot: CompletedBallot = {
          ballotId: '',
          ballotStyle: getBallotStyle({
            election,
            ballotStyleId: appState.ballotStyleId,
          })!,
          precinct: getPrecinctById({
            election,
            precinctId: appState.precinctId,
          })!,
          votes: appState.votes ?? blankBallotVotes,
          isTestMode: !appState.isLiveMode,
          ballotType: BallotType.Standard,
        }
        const longValue = encodeBallot(election, ballot)
        await card.writeLongUint8Array(longValue)
        dispatchAppState({ type: 'finishWritingLongValue' })
      }
    }, GLOBALS.CARD_POLLING_INTERVAL),
    [card]
  )

  const clearLongValue = useCallback(async () => {
    dispatchAppState({ type: 'startWritingLongValue' })
    await card.writeLongUint8Array(Uint8Array.of())
    dispatchAppState({ type: 'finishWritingLongValue' })
  }, [card])

  const markVoterCardVoided: MarkVoterCardFunction = useCallback(async () => {
    stopCardShortValueReadPolling()

    await clearLongValue()

    const currentVoterCardData: VoterCardData = JSON.parse(shortValue!)
    const voidedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      uz: utcTimestamp(),
    }
    await writeCard(voidedVoterCardData)

    const updatedCard = await readCard()
    const updatedShortValue: VoterCardData =
      updatedCard.present && JSON.parse(updatedCard.shortValue!)

    startCardShortValueReadPolling()

    /* istanbul ignore next - this should never happen */
    if (voidedVoterCardData.uz !== updatedShortValue.uz) {
      resetBallot()
      return false
    }
    return true
  }, [
    clearLongValue,
    readCard,
    resetBallot,
    shortValue,
    startCardShortValueReadPolling,
    stopCardShortValueReadPolling,
    writeCard,
  ])

  const markVoterCardPrinted: MarkVoterCardFunction = useCallback(async () => {
    stopCardShortValueReadPolling()
    dispatchAppState({ type: 'pauseCardProcessing' })

    await clearLongValue()

    const currentVoterCardData: VoterCardData = JSON.parse(shortValue!)
    const usedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      bp: utcTimestamp(),
    }
    await writeCard(usedVoterCardData)

    const updatedCard = await readCard()

    startCardShortValueReadPolling()

    const updatedShortValue: VoterCardData =
      updatedCard.present && JSON.parse(updatedCard.shortValue!)
    /* istanbul ignore next - When the card read doesn't match the card write. Currently not possible to test this without separating the write and read into separate methods and updating printing logic. This is an edge case. */
    if (usedVoterCardData.bp !== updatedShortValue.bp) {
      resetBallot()
      return false
    }
    return true
  }, [
    startCardShortValueReadPolling,
    stopCardShortValueReadPolling,
    clearLongValue,
    shortValue,
    resetBallot,
    readCard,
    writeCard,
  ])

  const [startHardwareStatusPolling, stopHardwareStatusPolling] = useCallback(
    useInterval(
      async () => {
        const battery = await hardware.readBatteryStatus()
        const newHasLowBattery = battery.level < GLOBALS.LOW_BATTERY_THRESHOLD
        const hasHardwareStateChanged =
          hasChargerAttached !== !battery.discharging ||
          hasLowBattery !== newHasLowBattery
        if (hasHardwareStateChanged) {
          dispatchAppState({
            type: 'updateHardwareState',
            hardwareState: {
              hasChargerAttached: !battery.discharging,
              hasLowBattery: newHasLowBattery,
            },
          })
        }
      },
      GLOBALS.HARDWARE_POLLING_INTERVAL,
      true
    ),
    [hardware]
  )

  // Handle Hardware Observer Subscription
  useEffect(() => {
    const hardwareStatusSubscription = hardware.devices
      .pipe(map((devices) => Array.from(devices)))
      .subscribe(async (devices) => {
        const hasAccessibleControllerAttached = devices.some(
          isAccessibleController
        )
        const hasCardReaderAttached = devices.some(isCardReader)
        const newPrinter = await hardware.readPrinterStatus()
        const hasPrinterAttached = newPrinter.connected
        if (!hasPrinterAttached) {
          resetBallot()
          // stop+start forces a last-card-value cache flush
          stopCardShortValueReadPolling()
          startCardShortValueReadPolling()
        }
        dispatchAppState({
          type: 'updateHardwareState',
          hardwareState: {
            hasAccessibleControllerAttached,
            hasCardReaderAttached,
            hasPrinterAttached,
          },
        })
      })
    return () => hardwareStatusSubscription.unsubscribe()
  }, [
    hardware,
    resetBallot,
    startCardShortValueReadPolling,
    stopCardShortValueReadPolling,
  ])

  // Handle Machine Config
  useEffect(() => {
    const setMachineConfig = async () => {
      try {
        const newMachineConfig = await machineConfigProvider.get()
        dispatchAppState({
          type: 'setMachineConfig',
          machineConfig: newMachineConfig,
        })
      } catch {
        // Do nothing if machineConfig fails. Default values will be used.
      }
    }
    setMachineConfig()
  }, [machineConfigProvider])

  // Handle Keyboard Input
  useEffect(() => {
    document.documentElement.setAttribute('data-useragent', navigator.userAgent)
    document.addEventListener('keydown', handleGamepadKeyboardEvent)
    return () => {
      document.removeEventListener('keydown', handleGamepadKeyboardEvent)
    }
  }, [])

  // Bootstraps the AppRoot Component
  useEffect(() => {
    const retrieveVotes = () => storage.get(votesStorageKey)
    const storedElectionDefinition = storage.get(electionStorageKey)
    const retrieveBallotActivation = (): SerializableActivationData =>
      storage.get(activationStorageKey) ||
      (({} as unknown) as SerializableActivationData)

    const storedAppState: Partial<State> = storage.get(stateStorageKey) || {}

    const {
      ballotStyleId: storedBallotStyleId,
      precinctId: storedPrecinctId,
    } = retrieveBallotActivation()
    const {
      appPrecinctId = initialAppState.appPrecinctId,
      ballotsPrintedCount = initialAppState.ballotsPrintedCount,
      isLiveMode = initialAppState.isLiveMode,
      isPollsOpen = initialAppState.isPollsOpen,
      tally = storedElectionDefinition?.election
        ? getZeroTally(storedElectionDefinition.election)
        : initialAppState.tally,
    } = storedAppState
    const ballotStyle =
      storedBallotStyleId &&
      storedElectionDefinition &&
      getBallotStyle({
        ballotStyleId: storedBallotStyleId,
        election: storedElectionDefinition.election,
      })
    const contests =
      ballotStyle && storedElectionDefinition?.election
        ? getContests({
            ballotStyle,
            election: storedElectionDefinition.election,
          })
        : initialAppState.contests
    dispatchAppState({
      type: 'initializeAppState',
      appState: {
        appPrecinctId,
        ballotsPrintedCount,
        ballotStyleId: storedBallotStyleId,
        contests,
        electionDefinition: storedElectionDefinition,
        isLiveMode,
        isPollsOpen,
        precinctId: storedPrecinctId,
        tally,
        votes: retrieveVotes(),
      },
    })
    startCardShortValueReadPolling()
    startLongValueWritePolling()
    startHardwareStatusPolling()
    return /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
      stopCardShortValueReadPolling()
      stopHardwareStatusPolling()
    }
  }, [
    startCardShortValueReadPolling,
    startHardwareStatusPolling,
    startLongValueWritePolling,
    stopCardShortValueReadPolling,
    stopHardwareStatusPolling,
    storage,
  ])

  // Handle Storing AppState (should be last to ensure that storage is updated after all other updates)
  useEffect(() => {
    const storeAppState = () => {
      storage.set(stateStorageKey, {
        appPrecinctId,
        ballotsPrintedCount,
        isLiveMode,
        isPollsOpen,
        tally,
      })
    }

    storeAppState()
  }, [
    appPrecinctId,
    ballotsPrintedCount,
    isLiveMode,
    isPollsOpen,
    storage,
    tally,
  ])

  if (!hasCardReaderAttached) {
    return (
      <SetupCardReaderPage
        useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
      />
    )
  }
  if (hasLowBattery && !hasChargerAttached) {
    return (
      <SetupPowerPage
        useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
      />
    )
  }
  if (isAdminCardPresent) {
    return (
      <AdminScreen
        appMode={appMode}
        appPrecinctId={appPrecinctId}
        ballotsPrintedCount={ballotsPrintedCount}
        electionDefinition={optionalElectionDefinition}
        fetchElection={fetchElection}
        isLiveMode={isLiveMode}
        updateAppPrecinctId={updateAppPrecinctId}
        toggleLiveMode={toggleLiveMode}
        unconfigure={unconfigure}
      />
    )
  }
  if (optionalElectionDefinition && !!appPrecinctId) {
    if (appMode.isVxPrint && !hasPrinterAttached) {
      return (
        <SetupPrinterPage
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      )
    }
    if (isPollWorkerCardPresent) {
      return (
        <PollWorkerScreen
          appPrecinctId={appPrecinctId}
          ballotsPrintedCount={ballotsPrintedCount}
          electionDefinition={optionalElectionDefinition}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          machineConfig={machineConfig}
          printer={printer}
          tally={tally}
          togglePollsOpen={togglePollsOpen}
          enableLiveMode={enableLiveMode}
        />
      )
    }
    if (!isVoterCardValid) {
      return (
        <WrongElectionScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      )
    }
    if (isPollsOpen && isVoterCardVoided) {
      return (
        <ExpiredCardScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      )
    }
    if (isPollsOpen && isVoterCardPrinted) {
      if (isRecentVoterPrint && appMode.isVxMark && appMode.isVxPrint) {
        return <CastBallotPage />
      }
      return (
        <UsedCardScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      )
    }
    if (isPollsOpen && isVoterCardExpired) {
      return (
        <ExpiredCardScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      )
    }
    if (isPollsOpen && appMode.isVxPrint && !appMode.isVxMark) {
      return (
        <PrintOnlyScreen
          ballotStyleId={ballotStyleId}
          ballotsPrintedCount={ballotsPrintedCount}
          electionDefinition={optionalElectionDefinition}
          isLiveMode={isLiveMode}
          isVoterCardPresent={isVoterCardPresent}
          markVoterCardPrinted={markVoterCardPrinted}
          precinctId={precinctId}
          printer={printer}
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
          showNoChargerAttachedWarning={!hasChargerAttached}
          updateTally={updateTally}
          votes={votes}
        />
      )
    }
    if (isPollsOpen && appMode.isVxMark) {
      if (isVoterCardPresent && ballotStyleId && precinctId) {
        if (appPrecinctId !== precinctId) {
          return (
            <WrongPrecinctScreen
              useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
            />
          )
        }
        return (
          <Gamepad onButtonDown={handleGamepadButtonDown}>
            <BallotContext.Provider
              value={{
                machineConfig,
                ballotStyleId,
                contests,
                electionDefinition: optionalElectionDefinition,
                updateTally,
                isLiveMode,
                markVoterCardPrinted,
                markVoterCardVoided,
                precinctId,
                printer,
                resetBallot,
                setUserSettings,
                updateVote,
                forceSaveVote,
                userSettings,
                votes: votes ?? blankBallotVotes,
              }}
            >
              <Ballot />
            </BallotContext.Provider>
          </Gamepad>
        )
      }
    }

    return (
      <IdleTimer
        onIdle={() => window.kiosk?.quit()}
        timeout={GLOBALS.QUIT_KIOSK_IDLE_SECONDS * 1000}
      >
        <InsertCardScreen
          appPrecinctId={appPrecinctId}
          electionDefinition={optionalElectionDefinition}
          showNoAccessibleControllerWarning={
            !!appMode.isVxMark && !hasAccessibleControllerAttached
          }
          showNoChargerAttachedWarning={!hasChargerAttached}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
        />
      </IdleTimer>
    )
  }
  return <UnconfiguredScreen />
}

export default AppRoot
