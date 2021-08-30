import { strict as assert } from 'assert'
import makeDebug from 'debug'
import {
  BallotType,
  CompletedBallot,
  ElectionDefinition,
  OptionalElectionDefinition,
  OptionalVote,
  Provider,
  VotesDict,
  getBallotStyle,
  getContests,
  getPrecinctById,
  safeParseElectionDefinition,
  Optional,
  safeParseJSON,
  AnyCardDataSchema,
  VoterCardDataSchema,
  VoterCardData,
} from '@votingworks/types'
import { decodeBallot, encodeBallot } from '@votingworks/ballot-encoder'
import 'normalize.css'
import React, { useCallback, useEffect, useReducer, useRef } from 'react'
import Gamepad from 'react-gamepad'
import { RouteComponentProps } from 'react-router-dom'
import './App.css'
import IdleTimer from 'react-idle-timer'
import { map } from 'rxjs/operators'
import useInterval from '@rooks/use-interval'
import {
  Card,
  Storage,
  Hardware,
  isAccessibleController,
  isCardReader,
  getZeroTally,
  calculateTally,
  Tally,
  CardTally,
  CardAPI,
  CardPresentAPI,
  CardTallySchema,
  throwIllegalValue,
} from '@votingworks/utils'

import Ballot from './components/Ballot'
import * as GLOBALS from './config/globals'
import {
  MarkVoterCardFunction,
  PartialUserSettings,
  UserSettings,
  VxMarkOnly,
  SerializableActivationData,
  MachineConfig,
  PostVotingInstructions,
  PrecinctSelection,
  PrecinctSelectionKind,
  Printer,
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
import utcTimestamp from './utils/utcTimestamp'
import { ScreenReader } from './utils/ScreenReader'

const debug = makeDebug('bmd:AppRoot')

interface CardState {
  adminCardElectionHash?: string
  isAdminCardPresent: boolean
  isCardlessVoter: boolean
  isPollWorkerCardPresent: boolean
  isVoterCardExpired: boolean
  isVoterCardVoided: boolean
  isVoterCardPresent: boolean
  isVoterCardPrinted: boolean
  isVoterCardValid: boolean
  isPollWorkerCardValid: boolean
  pauseProcessingUntilNoCardPresent: boolean
  showPostVotingInstructions?: PostVotingInstructions
  voterCardCreatedAt: number
  talliesOnCard?: Optional<CardTally>
}

interface UserState {
  ballotStyleId?: string
  precinctId?: string
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
  appPrecinct?: PrecinctSelection
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
  lastCardDataString?: string
  initializedFromStorage: boolean
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
  storage: Storage
  screenReader: ScreenReader
}

export const electionStorageKey = 'electionDefinition'
export const stateStorageKey = 'state'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'
export const blankBallotVotes = {}

const initialCardState: Readonly<CardState> = {
  adminCardElectionHash: undefined,
  isAdminCardPresent: false,
  isCardlessVoter: false,
  isPollWorkerCardPresent: false,
  isVoterCardExpired: false,
  isVoterCardVoided: false,
  isVoterCardPresent: false,
  isVoterCardPrinted: false,
  isVoterCardValid: true,
  isPollWorkerCardValid: true,
  pauseProcessingUntilNoCardPresent: false,
  showPostVotingInstructions: undefined,
  voterCardCreatedAt: 0,
}

const initialVoterState: Readonly<UserState> = {
  ballotStyleId: undefined,
  precinctId: undefined,
  shortValue: '{}',
  userSettings: { textSize: GLOBALS.TEXT_SIZE },
  votes: undefined,
}

const initialHardwareState: Readonly<HardwareState> = {
  hasAccessibleControllerAttached: false,
  hasCardReaderAttached: true,
  hasChargerAttached: true,
  hasLowBattery: false,
  hasPrinterAttached: true,
  machineConfig: { appMode: VxMarkOnly, machineId: '0000', codeVersion: 'dev' },
}

const initialSharedState: Readonly<SharedState> = {
  appPrecinct: undefined,
  ballotsPrintedCount: 0,
  electionDefinition: undefined,
  isLiveMode: false,
  isPollsOpen: false,
  tally: [],
}

const initialOtherState: Readonly<OtherState> = {
  lastVoteUpdateAt: 0,
  lastVoteSaveToCardAt: 0,
  forceSaveVoteFlag: false,
  writingVoteToCard: false,
  lastCardDataString: undefined,
  initializedFromStorage: false,
}

const initialUserState: Readonly<InitialUserState> = {
  ...initialVoterState,
  ...initialCardState,
  ...initialSharedState,
}

const initialAppState: Readonly<State> = {
  ...initialUserState,
  ...initialHardwareState,
  ...initialOtherState,
}

// Sets State. All side effects done outside: storage, fetching, etc
type AppAction =
  | { type: 'processAdminCard'; electionHash: string }
  | {
      type: 'processPollWorkerCard'
      isPollWorkerCardValid: boolean
      talliesOnCard?: CardTally
    }
  | { type: 'processVoterCard'; voterState: Partial<InitialUserState> }
  | { type: 'pauseCardProcessing' }
  | { type: 'resumeCardProcessing' }
  | { type: 'setMachineConfig'; machineConfig: MachineConfig }
  | { type: 'updateLastVoteUpdateAt'; date: number }
  | { type: 'unconfigure' }
  | { type: 'updateVote'; contestId: string; vote: OptionalVote }
  | { type: 'forceSaveVote' }
  | { type: 'resetBallot'; showPostVotingInstructions?: PostVotingInstructions }
  | { type: 'setUserSettings'; userSettings: PartialUserSettings }
  | { type: 'updateAppPrecinct'; appPrecinct: PrecinctSelection }
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
  | {
      type: 'activateCardlessBallot'
      precinctId: string
      ballotStyleId?: string
    }
  | { type: 'resetCardlessBallot' }
  | { type: 'maintainCardlessBallot' }
  | {
      type: 'updatePollWorkerCardTally'
      talliesOnCard?: CardTally
    }

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
        adminCardElectionHash: action.electionHash,
      }
    case 'processPollWorkerCard':
      return {
        ...state,
        ...initialCardState,
        isCardlessVoter: state.isCardlessVoter,
        isPollWorkerCardPresent: true,
        isPollWorkerCardValid: action.isPollWorkerCardValid,
        talliesOnCard: action.talliesOnCard,
      }
    case 'processVoterCard':
      assert(typeof action.voterState.voterCardCreatedAt !== 'undefined')
      return {
        ...state,
        ...initialCardState,
        ...action.voterState,
        isVoterCardExpired:
          state.voterCardCreatedAt === 0 &&
          utcTimestamp() >=
            action.voterState.voterCardCreatedAt +
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
        pauseProcessingUntilNoCardPresent:
          initialCardState.pauseProcessingUntilNoCardPresent,
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
        showPostVotingInstructions: action.showPostVotingInstructions,
        pauseProcessingUntilNoCardPresent:
          action.showPostVotingInstructions === 'card',
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
    case 'updateAppPrecinct':
      return {
        ...state,
        ...resetTally,
        appPrecinct: action.appPrecinct,
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
      const { electionDefinition, tally, votes, ballotStyleId } = state
      assert(
        electionDefinition,
        'electionDefinition is required to updateTally'
      )
      assert(
        typeof ballotStyleId !== 'undefined',
        'ballotStyleId is required to updateTally'
      )
      return {
        ...state,
        ballotsPrintedCount: state.ballotsPrintedCount + 1,
        tally: calculateTally({
          tally,
          ballotStyleId,
          election: electionDefinition.election,
          votes: votes ?? {},
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
        initializedFromStorage: true,
      }
    case 'updateLastCardDataString': {
      return {
        ...state,
        lastCardDataString: action.currentCardDataString,
      }
    }
    case 'activateCardlessBallot': {
      return {
        ...state,
        ballotStyleId: action.ballotStyleId,
        isCardlessVoter: true,
        precinctId: action.precinctId,
        votes: initialVoterState.votes,
      }
    }
    case 'resetCardlessBallot': {
      return {
        ...state,
        ballotStyleId: undefined,
        isCardlessVoter: initialCardState.isCardlessVoter,
        precinctId: undefined,
        votes: initialVoterState.votes,
      }
    }
    case 'maintainCardlessBallot':
      return {
        ...state,
        ...initialCardState,
        isCardlessVoter: true,
        precinctId: state.precinctId,
        ballotStyleId: state.ballotStyleId,
        votes: state.votes,
      }
    case 'updatePollWorkerCardTally':
      return {
        ...state,
        talliesOnCard: action.talliesOnCard,
      }
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(action)
  }
}

const AppRoot = ({
  card,
  hardware,
  history,
  machineConfig: machineConfigProvider,
  printer,
  screenReader,
  storage,
}: Props): JSX.Element => {
  const PostVotingInstructionsTimeout = useRef(0)
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState)
  const {
    appPrecinct,
    ballotsPrintedCount,
    ballotStyleId,
    isCardlessVoter,
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
    isPollWorkerCardValid,
    initializedFromStorage,
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
    showPostVotingInstructions,
    tally,
    talliesOnCard,
    userSettings,
    votes,
    voterCardCreatedAt,
  } = appState

  const { appMode } = machineConfig
  const { textSize: userSettingsTextSize } = userSettings

  const ballotStyle =
    optionalElectionDefinition?.election && ballotStyleId
      ? getBallotStyle({
          ballotStyleId,
          election: optionalElectionDefinition.election,
        })
      : undefined
  const contests =
    optionalElectionDefinition?.election && ballotStyle
      ? getContests({
          ballotStyle,
          election: optionalElectionDefinition.election,
        })
      : []

  const readCard = useCallback(async (): Promise<CardAPI> => {
    return await card.readStatus()
  }, [card])

  const writeCard = useCallback(
    async (cardData: VoterCardData) => {
      await card.writeShortValue(JSON.stringify(cardData))
    },
    [card]
  )

  // Disable the audiotrack when in admin mode
  useEffect(() => {
    const updateScreenReader = async () => {
      if (isAdminCardPresent) {
        await screenReader.disable()
      } else {
        await screenReader.enable()
      }
    }
    void updateScreenReader()
  }, [isAdminCardPresent, screenReader])

  // Handle Storing Election Locally
  useEffect(() => {
    const storeElection = async (electionDefinition: ElectionDefinition) => {
      await storage.set(electionStorageKey, electionDefinition)
    }
    if (optionalElectionDefinition) {
      void storeElection(optionalElectionDefinition)
    }
  }, [optionalElectionDefinition, storage])

  // Handle Vote Updated (and store votes locally in !production)
  useEffect(() => {
    const storeVotes = async (votesToStore: VotesDict) => {
      const storedVotes =
        (await storage.get(votesStorageKey)) || blankBallotVotes
      if (JSON.stringify(storedVotes) !== JSON.stringify(votesToStore)) {
        /* istanbul ignore else */
        if (process.env.NODE_ENV !== 'production') {
          await storage.set(votesStorageKey, votesToStore)
        }

        dispatchAppState({ type: 'updateLastVoteUpdateAt', date: Date.now() })
      }
    }
    if (votes) {
      void storeVotes(votes)
    }
  }, [votes, storage])

  const resetBallot = useCallback(
    async (newShowPostVotingInstructions?: PostVotingInstructions) => {
      await storage.remove(activationStorageKey)
      await storage.remove(votesStorageKey)
      dispatchAppState({
        type: 'resetBallot',
        showPostVotingInstructions: newShowPostVotingInstructions,
      })
      history.push('/')
    },
    [storage, history]
  )

  const hidePostVotingInstructions = () => {
    clearTimeout(PostVotingInstructionsTimeout.current)
    dispatchAppState({ type: 'resetBallot' })
  }

  // Hide Verify and Cast Instructions
  useEffect(() => {
    if (showPostVotingInstructions) {
      PostVotingInstructionsTimeout.current = window.setTimeout(
        hidePostVotingInstructions,
        GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS * 1000
      )
    }
    return () => {
      clearTimeout(PostVotingInstructionsTimeout.current)
    }
  }, [showPostVotingInstructions])

  const unconfigure = useCallback(async () => {
    await storage.clear()
    dispatchAppState({ type: 'unconfigure' })
    history.push('/')
  }, [storage, history])

  const updateVote = useCallback((contestId: string, vote: OptionalVote) => {
    dispatchAppState({ contestId, vote, type: 'updateVote' })
  }, [])

  const forceSaveVote = useCallback(() => {
    dispatchAppState({ type: 'forceSaveVote' })
  }, [])

  const setUserSettings = useCallback(
    (newUserSettings: PartialUserSettings) => {
      dispatchAppState({
        type: 'setUserSettings',
        userSettings: newUserSettings,
      })
    },
    []
  )

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

  const updateAppPrecinct = useCallback((newAppPrecinct: PrecinctSelection) => {
    dispatchAppState({
      type: 'updateAppPrecinct',
      appPrecinct: newAppPrecinct,
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

  const resetPollWorkerCardTally = useCallback(async () => {
    const possibleCardTally = await card.readLongObject(CardTallySchema)
    dispatchAppState({
      type: 'updatePollWorkerCardTally',
      talliesOnCard: possibleCardTally.ok(),
    })
  }, [card])

  const saveTallyToCard = useCallback(
    async (cardTally: CardTally) => {
      await card.writeLongObject(cardTally)
      await resetPollWorkerCardTally()
    },
    [card, resetPollWorkerCardTally]
  )

  const fetchElection = useCallback(async () => {
    const electionData = await card.readLongString()
    /* istanbul ignore else */
    if (electionData) {
      const electionDefinitionResult = safeParseElectionDefinition(electionData)
      dispatchAppState({
        type: 'updateElectionDefinition',
        electionDefinition: electionDefinitionResult.unsafeUnwrap(),
      })
    }
  }, [card])

  const activateCardlessBallot = useCallback(
    (sessionPrecinctId: string, sessionBallotStyleId?: string) => {
      dispatchAppState({
        type: 'activateCardlessBallot',
        precinctId: sessionPrecinctId,
        ballotStyleId: sessionBallotStyleId,
      })
      history.push('/')
    },
    [history]
  )

  const resetCardlessBallot = useCallback(() => {
    dispatchAppState({ type: 'resetCardlessBallot' })
    history.push('/')
  }, [history])

  const processCard = useCallback(
    async ({ longValueExists, shortValue: cardShortValue }: CardPresentAPI) => {
      const parseShortValueResult = safeParseJSON(
        /* istanbul ignore next */
        cardShortValue ?? '',
        AnyCardDataSchema
      )
      if (parseShortValueResult.isErr()) {
        debug('ignoring invalid short value: %s', cardShortValue)
        return
      }
      const cardData = parseShortValueResult.ok()
      if (!optionalElectionDefinition && cardData.t !== 'admin') {
        return
      }
      switch (cardData.t) {
        case 'voter': {
          assert(optionalElectionDefinition)
          const cardIsVoterCardVoided = Boolean(cardData.uz)
          const cardBallotPrintedTime = cardData.bp ? Number(cardData.bp) : 0
          const cardIsVoterCardPrinted = Boolean(cardBallotPrintedTime)
          const cardBallotStyle = getBallotStyle({
            election: optionalElectionDefinition.election,
            ballotStyleId: cardData.bs,
          })
          const cardPrecinct = getPrecinctById({
            election: optionalElectionDefinition.election,
            precinctId: cardData.pr,
          })
          const newIsVoterCardValid =
            Boolean(cardBallotStyle) && Boolean(cardPrecinct)

          const fetchBallotData = async () => {
            const longValue = await card.readLongUint8Array()
            assert(longValue)
            return decodeBallot(optionalElectionDefinition.election, longValue)
          }

          const ballot: Partial<CompletedBallot> =
            (longValueExists &&
              newIsVoterCardValid &&
              !cardIsVoterCardVoided &&
              !cardIsVoterCardPrinted &&
              (await fetchBallotData())) ||
            {}

          dispatchAppState({
            type: 'processVoterCard',
            voterState: {
              shortValue: cardShortValue,
              isVoterCardVoided: cardIsVoterCardVoided,
              isVoterCardPresent: true,
              isVoterCardPrinted: cardIsVoterCardPrinted,
              isVoterCardValid: newIsVoterCardValid,
              voterCardCreatedAt: cardData.c,
              ballotStyleId:
                cardBallotStyle?.id ?? initialAppState.ballotStyleId,
              precinctId: cardPrecinct?.id ?? initialAppState.precinctId,
              votes: ballot.votes,
            },
          })

          break
        }
        case 'pollworker': {
          const isValid =
            cardData.h === optionalElectionDefinition?.electionHash

          const possibleCardTally =
            isValid && longValueExists
              ? (await card.readLongObject(CardTallySchema)).ok()
              : undefined
          dispatchAppState({
            type: 'processPollWorkerCard',
            isPollWorkerCardValid: isValid,
            talliesOnCard: possibleCardTally,
          })
          break
        }
        case 'admin': {
          /* istanbul ignore else */
          if (longValueExists) {
            dispatchAppState({
              type: 'processAdminCard',
              electionHash: cardData.h,
            })
          }
          break
        }
        /* istanbul ignore next - compile time check for completeness */
        default:
          throwIllegalValue(cardData)
      }
    },
    [card, optionalElectionDefinition]
  )

  const cardShortValueReadInterval = useInterval(async () => {
    const insertedCard = await card.readStatus()
    if (pauseProcessingUntilNoCardPresent) {
      if (insertedCard.present) {
        return
      }
      dispatchAppState({ type: 'resumeCardProcessing' })
    }
    if (!initializedFromStorage) {
      return
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
      currentCardDataString,
      type: 'updateLastCardDataString',
    })

    if (!insertedCard.present || !insertedCard.shortValue) {
      if (isCardlessVoter) {
        dispatchAppState({
          type: 'maintainCardlessBallot',
        })
        return
      }

      await resetBallot()
      return
    }
    await processCard(insertedCard)
  }, GLOBALS.CARD_POLLING_INTERVAL)
  const startCardShortValueReadPolling = useCallback(
    cardShortValueReadInterval[0],
    [card]
  )
  const stopCardShortValueReadPolling = useCallback(
    cardShortValueReadInterval[1],
    [card]
  )

  const longValueWriteInterval = useInterval(async () => {
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
      assert(appState.electionDefinition)
      const { election, electionHash } = appState.electionDefinition
      const ballot: CompletedBallot = {
        electionHash,
        ballotId: '',
        ballotStyleId: appState.ballotStyleId,
        precinctId: appState.precinctId,
        votes: appState.votes ?? blankBallotVotes,
        isTestMode: !appState.isLiveMode,
        ballotType: BallotType.Standard,
      }
      const longValue = encodeBallot(election, ballot)
      await card.writeLongUint8Array(longValue)
      dispatchAppState({ type: 'finishWritingLongValue' })
    }
  }, GLOBALS.CARD_POLLING_INTERVAL)
  const startLongValueWritePolling = useCallback(longValueWriteInterval[0], [
    card,
  ])

  const clearLongValue = useCallback(async () => {
    dispatchAppState({ type: 'startWritingLongValue' })
    await card.writeLongUint8Array(Uint8Array.of())
    dispatchAppState({ type: 'finishWritingLongValue' })
  }, [card])

  const clearTalliesOnCard = useCallback(async () => {
    await clearLongValue()
    await resetPollWorkerCardTally()
  }, [clearLongValue, resetPollWorkerCardTally])

  const markVoterCardVoided: MarkVoterCardFunction = useCallback(async () => {
    stopCardShortValueReadPolling()

    await clearLongValue()

    const currentVoterCardData = safeParseJSON(
      /* istanbul ignore next */
      shortValue ?? '',
      VoterCardDataSchema
    ).unsafeUnwrap()
    const voidedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      uz: utcTimestamp(),
    }
    await writeCard(voidedVoterCardData)

    const updatedCard = await readCard()
    const updatedShortValue = updatedCard.present
      ? safeParseJSON(
          /* istanbul ignore next */
          updatedCard.shortValue ?? '',
          VoterCardDataSchema
        ).unsafeUnwrap()
      : /* istanbul ignore next - this should never happen */
        undefined

    startCardShortValueReadPolling()

    /* istanbul ignore next - this should never happen */
    if (voidedVoterCardData.uz !== updatedShortValue?.uz) {
      await resetBallot()
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
    if (isCardlessVoter) {
      return true
    }
    stopCardShortValueReadPolling()
    dispatchAppState({ type: 'pauseCardProcessing' })

    await clearLongValue()

    const currentVoterCardData = safeParseJSON(
      /* istanbul ignore next */
      shortValue ?? '',
      VoterCardDataSchema
    ).unsafeUnwrap()
    const usedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      bp: utcTimestamp(),
    }
    await writeCard(usedVoterCardData)

    const updatedCard = await readCard()

    startCardShortValueReadPolling()

    const updatedShortValue = updatedCard.present
      ? safeParseJSON(
          /* istanbul ignore next */
          updatedCard.shortValue ?? '',
          VoterCardDataSchema
        ).unsafeUnwrap()
      : /* istanbul ignore next - this should never happen */
        undefined
    /* istanbul ignore next - When the card read doesn't match the card write. Currently not possible to test this without separating the write and read into separate methods and updating printing logic. This is an edge case. */
    if (usedVoterCardData.bp !== updatedShortValue?.bp) {
      await resetBallot()
      return false
    }
    return true
  }, [
    clearLongValue,
    isCardlessVoter,
    readCard,
    resetBallot,
    shortValue,
    startCardShortValueReadPolling,
    stopCardShortValueReadPolling,
    writeCard,
  ])

  const hardwareStatusInterval = useInterval(
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
  )
  const startHardwareStatusPolling = useCallback(hardwareStatusInterval[0], [
    hardware,
  ])
  const stopHardwareStatusPolling = useCallback(hardwareStatusInterval[1], [
    hardware,
  ])

  // Handle Hardware Observer Subscription
  useEffect(() => {
    const hardwareStatusSubscription = hardware.devices
      .pipe(map((devices) => Array.from(devices)))
      .subscribe(async (devices) => {
        const newHasAccessibleControllerAttached = devices.some(
          isAccessibleController
        )
        const newHasCardReaderAttached = devices.some(isCardReader)
        dispatchAppState({
          type: 'updateHardwareState',
          hardwareState: {
            hasAccessibleControllerAttached: newHasAccessibleControllerAttached,
            hasCardReaderAttached: newHasCardReaderAttached,
          },
        })
      })
    const printerStatusSubscription = hardware.printers
      .pipe(map((printers) => Array.from(printers)))
      .subscribe(async (printers) => {
        const newHasPrinterAttached = printers.some(
          ({ connected }) => connected
        )
        if (!newHasPrinterAttached) {
          await resetBallot()
          // stop+start forces a last-card-value cache flush
          stopCardShortValueReadPolling()
          startCardShortValueReadPolling()
        }
        dispatchAppState({
          type: 'updateHardwareState',
          hardwareState: {
            hasPrinterAttached: newHasPrinterAttached,
          },
        })
      })
    return () => {
      hardwareStatusSubscription.unsubscribe()
      printerStatusSubscription.unsubscribe()
    }
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
    void setMachineConfig()
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
    const updateStorage = async () => {
      // TODO: validate this with zod schema
      const retrieveVotes = async () =>
        (await storage.get(votesStorageKey)) as VotesDict | undefined
      // TODO: validate this with zod schema
      const storedElectionDefinition = (await storage.get(
        electionStorageKey
      )) as ElectionDefinition | undefined
      const retrieveBallotActivation = async (): Promise<SerializableActivationData> =>
        // TODO: validate this with zod schema
        ((await storage.get(activationStorageKey)) as
          | SerializableActivationData
          | undefined) || (({} as unknown) as SerializableActivationData)

      const storedAppState: Partial<State> =
        // TODO: validate this with zod schema
        ((await storage.get(stateStorageKey)) as Partial<State> | undefined) ||
        {}

      const {
        ballotStyleId: retrievedBallotStyleId,
        isCardlessVoter: retrievedCardlessActivatedAt,
        precinctId: retrievedPrecinctId,
      } = await retrieveBallotActivation()
      const {
        appPrecinct: storedAppPrecinct = initialAppState.appPrecinct,
        ballotsPrintedCount: storedBallotsPrintedCount = initialAppState.ballotsPrintedCount,
        isLiveMode: storedIsLiveMode = initialAppState.isLiveMode,
        isPollsOpen: storedIsPollsOpen = initialAppState.isPollsOpen,
        tally: storedTally = storedElectionDefinition?.election
          ? getZeroTally(storedElectionDefinition.election)
          : initialAppState.tally,
      } = storedAppState
      dispatchAppState({
        type: 'initializeAppState',
        appState: {
          appPrecinct: storedAppPrecinct,
          ballotsPrintedCount: storedBallotsPrintedCount,
          ballotStyleId: retrievedBallotStyleId,
          electionDefinition: storedElectionDefinition,
          isCardlessVoter: retrievedCardlessActivatedAt,
          isLiveMode: storedIsLiveMode,
          isPollsOpen: storedIsPollsOpen,
          precinctId: retrievedPrecinctId,
          tally: storedTally,
          votes: await retrieveVotes(),
        },
      })
    }
    void updateStorage()
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

  // Handle Ballot Activation (should be after last to ensure that storage is updated after all other updates)
  useEffect(() => {
    const updateStorage = async () =>
      await storage.set(activationStorageKey, {
        ballotStyleId,
        isCardlessVoter,
        precinctId,
      })
    if (precinctId && ballotStyleId) {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        void updateStorage()
      }
    }
  }, [ballotStyleId, isCardlessVoter, precinctId, storage, voterCardCreatedAt])

  // Handle Storing AppState (should be after last to ensure that storage is updated after all other updates)
  useEffect(() => {
    const storeAppState = async () => {
      if (initializedFromStorage) {
        await storage.set(stateStorageKey, {
          appPrecinct,
          ballotsPrintedCount,
          isLiveMode,
          isPollsOpen,
          tally,
        })
      }
    }

    void storeAppState()
  }, [
    appPrecinct,
    ballotsPrintedCount,
    isLiveMode,
    isPollsOpen,
    storage,
    tally,
    initializedFromStorage,
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
        appPrecinct={appPrecinct}
        ballotsPrintedCount={ballotsPrintedCount}
        electionDefinition={optionalElectionDefinition}
        fetchElection={fetchElection}
        isLiveMode={isLiveMode}
        updateAppPrecinct={updateAppPrecinct}
        toggleLiveMode={toggleLiveMode}
        unconfigure={unconfigure}
        machineConfig={machineConfig}
      />
    )
  }
  if (optionalElectionDefinition && appPrecinct) {
    if (appMode.isVxPrint && !hasPrinterAttached) {
      return (
        <SetupPrinterPage
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      )
    }
    if (!isVoterCardValid || !isPollWorkerCardValid) {
      return (
        <WrongElectionScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
          isVoterCard={isVoterCardPresent}
        />
      )
    }
    if (isPollWorkerCardPresent) {
      return (
        <PollWorkerScreen
          activateCardlessVoterSession={activateCardlessBallot}
          resetCardlessVoterSession={resetCardlessBallot}
          appPrecinct={appPrecinct}
          ballotsPrintedCount={ballotsPrintedCount}
          cardlessVoterSessionPrecinctId={precinctId}
          cardlessVoterSessionBallotStyleId={ballotStyleId}
          electionDefinition={optionalElectionDefinition}
          enableLiveMode={enableLiveMode}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          machineConfig={machineConfig}
          printer={printer}
          tally={tally}
          togglePollsOpen={togglePollsOpen}
          saveTallyToCard={saveTallyToCard}
          talliesOnCard={talliesOnCard}
          clearTalliesOnCard={clearTalliesOnCard}
          hasVotes={!!votes}
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
    if (
      isPollsOpen &&
      showPostVotingInstructions &&
      appMode.isVxMark &&
      appMode.isVxPrint
    ) {
      return (
        <CastBallotPage
          showPostVotingInstructions={showPostVotingInstructions}
          hidePostVotingInstructions={hidePostVotingInstructions}
        />
      )
    }
    if (isPollsOpen && isVoterCardPrinted) {
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
    if (isPollsOpen) {
      const isVoterVoting =
        (isVoterCardPresent || isCardlessVoter) &&
        Boolean(ballotStyleId) &&
        Boolean(precinctId)

      if (
        isVoterVoting &&
        appPrecinct.kind === PrecinctSelectionKind.SinglePrecinct &&
        appPrecinct.precinctId !== precinctId
      ) {
        return (
          <WrongPrecinctScreen
            useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
          />
        )
      }

      if (appMode.isVxPrint && !appMode.isVxMark) {
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

      if (isVoterVoting) {
        return (
          <Gamepad onButtonDown={handleGamepadButtonDown}>
            <BallotContext.Provider
              value={{
                machineConfig,
                ballotStyleId,
                contests,
                updateTally,
                isCardlessVoter,
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
                electionDefinition: optionalElectionDefinition,
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
          appPrecinct={appPrecinct}
          electionDefinition={optionalElectionDefinition}
          showNoAccessibleControllerWarning={
            appMode.isVxMark && !hasAccessibleControllerAttached
          }
          showNoChargerAttachedWarning={!hasChargerAttached}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          machineConfig={machineConfig}
        />
      </IdleTimer>
    )
  }
  return <UnconfiguredScreen />
}

export default AppRoot
