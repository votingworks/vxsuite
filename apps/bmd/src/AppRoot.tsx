/* eslint-disable no-shadow */
import {
  BallotType,
  CandidateVote,
  CompletedBallot,
  Election,
  ElectionDefinition,
  OptionalElectionDefinition,
  OptionalVote,
  Provider,
  VotesDict,
  YesNoVote,
  getBallotStyle,
  getContests,
  getPrecinctById,
} from '@votingworks/types'
import { decodeBallot, encodeBallot } from '@votingworks/ballot-encoder'
import 'normalize.css'
import React, { useCallback, useEffect, useReducer, useRef } from 'react'
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
  MachineConfig,
  PostVotingInstructions,
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
import { getZeroTally } from './utils/election'
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
  adminCardElectionHash: string
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
}

interface UserState {
  ballotStyleId: string
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
  storage: Storage
}

export const electionStorageKey = 'electionDefinition'
export const stateStorageKey = 'state'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'
export const blankBallotVotes = {}

const initialCardState: Readonly<CardState> = {
  adminCardElectionHash: '',
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
  ballotStyleId: '',
  precinctId: '',
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
  machineConfig: { appMode: VxMarkOnly, machineId: '0000' },
}

const initialSharedState: Readonly<SharedState> = {
  appPrecinctId: '',
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
  lastCardDataString: '',
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
  | { type: 'processAdminCard'; electionHash: string }
  | { type: 'processPollWorkerCard'; isPollWorkerCardValid: boolean }
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
  | { type: 'activateCardlessBallot'; ballotStyleId: string }
  | { type: 'maintainCardlessBallot' }

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
    case 'activateCardlessBallot': {
      if (action.ballotStyleId) {
        return {
          ...state,
          ballotStyleId: action.ballotStyleId,
          isCardlessVoter: true,
          precinctId: state.appPrecinctId,
          votes: initialVoterState.votes,
        }
      }
      return {
        ...state,
        ballotStyleId: '',
        isCardlessVoter: initialCardState.isCardlessVoter,
        precinctId: '',
        votes: initialVoterState.votes,
      }
    }
    case 'maintainCardlessBallot':
      return {
        ...state,
        ...initialCardState,
        isCardlessVoter: true,
        precinctId: state.precinctId,
        ballotStyleId: state.ballotStyleId!,
        votes: state.votes,
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
  const PostVotingInstructionsTimeout = useRef(0)
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState)
  const {
    adminCardElectionHash,
    appPrecinctId,
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
    userSettings,
    votes,
    voterCardCreatedAt,
  } = appState

  const { appMode } = machineConfig
  const { textSize: userSettingsTextSize } = userSettings

  const ballotStyle = optionalElectionDefinition?.election
    ? getBallotStyle({
        ballotStyleId,
        election: optionalElectionDefinition.election,
      })
    : ''
  const contests =
    optionalElectionDefinition?.election && ballotStyle
      ? getContests({
          election: optionalElectionDefinition.election,
          ballotStyle,
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

  // Handle Storing Election Locally
  useEffect(() => {
    const storeElection = (electionDefinition: ElectionDefinition) => {
      storage.set(electionStorageKey, electionDefinition)
    }
    if (optionalElectionDefinition) {
      storeElection(optionalElectionDefinition)
    }
  }, [optionalElectionDefinition, storage])

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
    (showPostVotingInstructions?: PostVotingInstructions) => {
      storage.remove(activationStorageKey)
      storage.remove(votesStorageKey)
      dispatchAppState({ type: 'resetBallot', showPostVotingInstructions })
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
      const computedElectionHash = sha256(electionData)
      /* istanbul ignore next */
      if (computedElectionHash !== adminCardElectionHash) {
        // eslint-disable-next-line no-console
        console.error(
          `computed election hash (${computedElectionHash}) does not match admin card election hash (${adminCardElectionHash})`
        )
      }
      dispatchAppState({
        type: 'updateElectionDefinition',
        electionDefinition: {
          election: JSON.parse(electionData),
          electionHash: computedElectionHash,
        },
      })
    }
  }, [card, adminCardElectionHash])

  const activateCardlessBallotStyleId = (ballotStyleId: string) => {
    dispatchAppState({
      type: 'activateCardlessBallot',
      ballotStyleId,
    })
    history.push('/')
  }

  const processCard = useCallback(
    async ({ longValueExists, shortValue: cardShortValue }: CardPresentAPI) => {
      const cardData: CardData = JSON.parse(cardShortValue!)
      if (!optionalElectionDefinition && cardData.t !== 'admin') {
        return
      }
      switch (cardData.t) {
        case 'voter': {
          const voterCardData = cardData as VoterCardData
          const isVoterCardVoided = Boolean(voterCardData.uz)
          const ballotPrintedTime = voterCardData.bp
            ? Number(voterCardData.bp)
            : 0
          const isVoterCardPrinted = Boolean(ballotPrintedTime)
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
            return decodeBallot(optionalElectionDefinition!.election, longValue)
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
              isVoterCardValid,
              voterCardCreatedAt: voterCardData.c,
              ballotStyleId: ballotStyle?.id ?? initialAppState.ballotStyleId,
              precinctId: precinct?.id ?? initialAppState.precinctId,
              votes: ballot.votes,
            },
          })

          break
        }
        case 'pollworker': {
          /* istanbul ignore next */
          const isValid =
            cardData.h === optionalElectionDefinition?.electionHash
          if (!isValid) {
            // eslint-disable-next-line no-console
            console.error(
              `poll worker card election hash (${cardData.h}) does not match configured election hash (${optionalElectionDefinition?.electionHash})`
            )
          }
          dispatchAppState({
            type: 'processPollWorkerCard',
            isPollWorkerCardValid: isValid,
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
      if (isCardlessVoter) {
        dispatchAppState({
          type: 'maintainCardlessBallot',
        })
        return
      }

      resetBallot()
      return
    }
    processCard(insertedCard)
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
      const { election, electionHash } = appState.electionDefinition!
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
    if (isCardlessVoter) {
      return true
    }
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
    // TODO: validate this with zod schema
    const retrieveVotes = () =>
      storage.get(votesStorageKey) as VotesDict | undefined
    // TODO: validate this with zod schema
    const storedElectionDefinition = storage.get(electionStorageKey) as
      | ElectionDefinition
      | undefined
    const retrieveBallotActivation = (): SerializableActivationData =>
      // TODO: validate this with zod schema
      (storage.get(activationStorageKey) as
        | SerializableActivationData
        | undefined) || (({} as unknown) as SerializableActivationData)

    const storedAppState: Partial<State> =
      // TODO: validate this with zod schema
      (storage.get(stateStorageKey) as Partial<State> | undefined) || {}

    const {
      ballotStyleId: retrievedBallotStyleId,
      isCardlessVoter: retrievedCardlessActivatedAt,
      precinctId: retrievedPrecinctId,
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
    dispatchAppState({
      type: 'initializeAppState',
      appState: {
        appPrecinctId,
        ballotsPrintedCount,
        ballotStyleId: retrievedBallotStyleId,
        electionDefinition: storedElectionDefinition,
        isCardlessVoter: retrievedCardlessActivatedAt,
        isLiveMode,
        isPollsOpen,
        precinctId: retrievedPrecinctId,
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

  // Handle Ballot Activation (should be after last to ensure that storage is updated after all other updates)
  useEffect(() => {
    if (precinctId && ballotStyleId) {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        storage.set(activationStorageKey, {
          ballotStyleId,
          isCardlessVoter,
          precinctId,
        })
      }
    }
  }, [ballotStyleId, isCardlessVoter, precinctId, storage, voterCardCreatedAt])

  // Handle Storing AppState (should be after last to ensure that storage is updated after all other updates)
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
          activateCardlessBallotStyleId={activateCardlessBallotStyleId}
          appPrecinctId={appPrecinctId}
          ballotsPrintedCount={ballotsPrintedCount}
          ballotStyleId={ballotStyleId}
          electionDefinition={optionalElectionDefinition}
          enableLiveMode={enableLiveMode}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          machineConfig={machineConfig}
          printer={printer}
          tally={tally}
          togglePollsOpen={togglePollsOpen}
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

      if (isVoterVoting && appPrecinctId !== precinctId) {
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
                electionDefinition: optionalElectionDefinition,
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
