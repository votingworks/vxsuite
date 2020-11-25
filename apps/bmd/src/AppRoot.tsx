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
  ElectionDefinition,
  OptionalElectionDefinition,
} from '@votingworks/ballot-encoder'
import 'normalize.css'
import React from 'react'
import Gamepad from 'react-gamepad'
import { RouteComponentProps } from 'react-router-dom'
import './App.css'
import IdleTimer from 'react-idle-timer'
import { Subscription } from 'rxjs'
import { sha256 } from 'js-sha256'
import { map } from 'rxjs/operators'
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
import IntervalPoller from './utils/IntervalPoller'
import { Storage } from './utils/Storage'
import {
  Hardware,
  isAccessibleController,
  isCardReader,
} from './utils/Hardware'
import { getSingleYesNoVote } from './utils/votes'
import { isSameDay } from './utils/date'

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
  userSettings: UserSettings
  cardlessActivatedAt: number
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
  shortValue?: string
  tally: Tally
}

export interface State
  extends CardState,
    UserState,
    HardwareState,
    SharedState {}

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  state?: Partial<State>
  activation?: SerializableActivationData
  votes?: VotesDict
}

export interface Props extends RouteComponentProps {
  hardware: Hardware
  card: Card
  storage: Storage<AppStorage>
  printer: Printer
  machineConfig: Provider<MachineConfig>
}

export const electionStorageKey = 'electionDefinition'
export const stateStorageKey = 'state'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'
export const blankBallotVotes = {}

class AppRoot extends React.Component<Props, State> {
  private machineIdAbortController = new AbortController()

  private cardPoller?: IntervalPoller
  private statusPoller?: IntervalPoller
  private onDeviceChangeSubscription?: Subscription
  private lastVoteUpdateAt = 0
  private lastVoteSaveToCardAt = 0
  private forceSaveVoteFlag = false
  private cardWriteInterval = 0
  private writingVoteToCard = false

  private initialCardPresentState: CardState = {
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

  private initialVoterState: UserState = {
    ballotCreatedAt: 0,
    ballotStyleId: '',
    contests: [],
    precinctId: '',
    userSettings: { textSize: GLOBALS.TEXT_SIZE },
    cardlessActivatedAt: 0,
    votes: blankBallotVotes,
  }

  private initialHardwareState: HardwareState = {
    hasAccessibleControllerAttached: false,
    hasCardReaderAttached: true,
    hasChargerAttached: true,
    hasLowBattery: false,
    hasPrinterAttached: true,
    machineConfig: { appMode: VxMarkOnly, machineId: '0000' },
  }

  private sharedState: SharedState = {
    appPrecinctId: '',
    ballotsPrintedCount: 0,
    electionDefinition: undefined,
    isLiveMode: false,
    isPollsOpen: false,
    shortValue: '{}',
    tally: [],
  }

  private initialUserState: Omit<State, keyof HardwareState> = {
    ...this.initialVoterState,
    ...this.initialCardPresentState,
    ...this.sharedState,
  }

  private initialAppState: State = {
    ...this.initialUserState,
    ...this.initialHardwareState,
  }

  public state = this.initialAppState

  public setMachineConfig = async () => {
    try {
      const machineConfig = await this.props.machineConfig.get()

      if (machineConfig) {
        this.setState({ machineConfig })
      }
    } catch {
      // TODO: what should happen if `machineConfig` is not returned?
    }
  }

  public readCard = async (): Promise<CardAPI> =>
    await this.props.card.readStatus()

  public writeCard = async (cardData: VoterCardData) => {
    await this.props.card.writeShortValue(JSON.stringify(cardData))
  }

  public retrieveElection = (): OptionalElectionDefinition =>
    this.props.storage.get(electionStorageKey)

  public storeElection = (election: ElectionDefinition) => {
    this.props.storage.set(electionStorageKey, election)
  }

  public retrieveBallotActivation = (): SerializableActivationData =>
    this.props.storage.get(activationStorageKey) ||
    (({} as unknown) as SerializableActivationData)

  public storeBallotActivation = (data: SerializableActivationData) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      this.props.storage.set(activationStorageKey, data)
    }
  }

  public retrieveVotes = () =>
    this.props.storage.get(votesStorageKey) || blankBallotVotes

  public storeVotes = async (votes: VotesDict) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      this.props.storage.set(votesStorageKey, votes)
    }

    this.lastVoteUpdateAt = Date.now()
  }

  public resetVoterData = () => {
    this.props.storage.remove(activationStorageKey)
    this.props.storage.remove(votesStorageKey)
  }

  public unconfigure = () => {
    this.setState(this.initialUserState)
    this.props.storage.clear()
    this.props.history.push('/')
  }

  public storeAppState = () => {
    const {
      appPrecinctId,
      ballotsPrintedCount,
      isLiveMode,
      isPollsOpen,
      tally,
    } = this.state
    this.props.storage.set(stateStorageKey, {
      appPrecinctId,
      ballotsPrintedCount,
      isLiveMode,
      isPollsOpen,
      tally,
    })
  }

  public retrieveAppState = (): Partial<State> => {
    return this.props.storage.get(stateStorageKey) || {}
  }

  public updateVote = (contestId: string, vote: OptionalVote) => {
    this.setState(
      (prevState) => ({
        votes: { ...prevState.votes, [contestId]: vote },
      }),
      () => {
        this.state.votes && this.storeVotes(this.state.votes)
      }
    )
  }

  public forceSaveVote = () => {
    this.forceSaveVoteFlag = true
  }

  public resetBallot = (path = '/') => {
    this.resetVoterData()

    this.setState(
      {
        ...this.initialCardPresentState,
        ...this.initialVoterState,
      },
      () => {
        this.storeAppState()
        this.props.history.push(path)
      }
    )
  }

  public setUserSettings = (partial: PartialUserSettings) => {
    this.setState(
      (prevState) => ({
        userSettings: { ...prevState.userSettings, ...partial },
      }),
      () => {
        const { textSize } = partial
        const isValidTextSize =
          'textSize' in partial &&
          typeof textSize === 'number' &&
          textSize >= 0 &&
          textSize <= GLOBALS.FONT_SIZES.length - 1
        /* istanbul ignore else */
        if (isValidTextSize) {
          this.setDocumentFontSize(textSize!)
          // Trigger application of “See More” buttons based upon scroll-port.
          window.dispatchEvent(new Event('resize'))
        }
      }
    )
  }

  public setDocumentFontSize = (textSize: number = GLOBALS.TEXT_SIZE) => {
    document.documentElement.style.fontSize = `${GLOBALS.FONT_SIZES[textSize]}px`
  }

  public updateAppPrecinctId = (appPrecinctId: string) => {
    this.setState({ appPrecinctId }, this.resetTally)
  }

  public enableLiveMode = () => {
    this.setState(
      { isLiveMode: true, isPollsOpen: this.initialUserState.isPollsOpen },
      this.resetTally
    )
  }

  public toggleLiveMode = () => {
    this.setState(
      (prevState) => ({
        isLiveMode: !prevState.isLiveMode,
        isPollsOpen: this.initialAppState.isPollsOpen,
      }),
      this.resetTally
    )
  }

  public togglePollsOpen = () => {
    this.setState(
      (prevState) => ({ isPollsOpen: !prevState.isPollsOpen }),
      this.storeAppState
    )
  }

  public resetTally = () => {
    this.setState(
      ({ electionDefinition }) => ({
        ballotsPrintedCount: this.initialAppState.ballotsPrintedCount,
        tally: getZeroTally(electionDefinition!.election),
      }),
      this.storeAppState
    )
  }

  public updateTally = () => {
    this.setState(
      ({
        ballotsPrintedCount,
        electionDefinition: e,
        tally: prevTally,
        votes,
      }) => {
        const election = e!.election

        // first update the tally for either-neither contests
        const {
          tally,
          contestIds: eitherNeitherContestIds,
        } = computeTallyForEitherNeitherContests({
          election,
          tally: prevTally,
          votes: votes,
        })

        for (const contestId in votes) {
          if (eitherNeitherContestIds.includes(contestId)) {
            continue
          }

          const contestIndex = election.contests.findIndex(
            (c) => c.id === contestId
          )
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
        return {
          ballotsPrintedCount: ballotsPrintedCount + 1,
          tally,
        }
      },
      this.storeAppState
    )
  }

  public fetchElection = async () => {
    const electionData = await this.props.card.readLongString()

    /* istanbul ignore else */
    if (electionData) {
      const election = JSON.parse(electionData)
      const electionDefinition = {
        election,
        electionHash: sha256(electionData),
      }
      this.setState({ electionDefinition }, this.resetTally)
      this.storeElection(electionDefinition)
    }
  }

  public fetchBallotData = async () => {
    const longValue = (await this.props.card.readLongUint8Array())!
    /* istanbul ignore else */
    if (longValue) {
      const election = this.state.electionDefinition!.election
      const { ballot } = decodeBallot(election, longValue)
      return ballot
    } else {
      return undefined
    }
  }

  public processCard = async ({
    longValueExists,
    shortValue,
  }: CardPresentAPI) => {
    const { electionDefinition } = this.state
    const election = electionDefinition?.election
    const cardData: CardData = JSON.parse(shortValue!)
    switch (cardData.t) {
      case 'voter': {
        const voterCardData = cardData as VoterCardData
        const voterCardCreatedAt = voterCardData.c
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
          election: election!,
          ballotStyleId: voterCardData.bs,
        })
        const precinct = getPrecinctById({
          election: election!,
          precinctId: voterCardData.pr,
        })
        const isVoterCardValid = Boolean(ballotStyle) && Boolean(precinct)

        const ballot: Partial<CompletedBallot> =
          (longValueExists &&
            this.state.isVoterCardValid &&
            !this.state.isVoterCardExpired &&
            !this.state.isVoterCardVoided &&
            !this.state.isVoterCardPrinted &&
            (await this.fetchBallotData())) ||
          {}

        this.setState((prevState) => {
          const isVoterCardExpired =
            prevState.voterCardCreatedAt === 0 &&
            utcTimestamp() >=
              voterCardCreatedAt + GLOBALS.CARD_EXPIRATION_SECONDS

          return {
            ...this.initialCardPresentState,
            shortValue,
            isVoterCardExpired,
            isVoterCardVoided,
            isVoterCardPresent: true,
            isVoterCardPrinted,
            isRecentVoterPrint,
            isVoterCardValid,
            voterCardCreatedAt,
            ballotStyleId:
              ballotStyle?.id ?? this.initialAppState.ballotStyleId,
            precinctId: precinct?.id ?? this.initialAppState.precinctId,
            votes: ballot.votes,
            contests:
              ballotStyle && election
                ? getContests({ ballotStyle, election })
                : this.initialAppState.contests,
          }
        })
        precinct &&
          ballotStyle &&
          this.storeBallotActivation({
            ballotCreatedAt: voterCardData.c,
            ballotStyleId: ballotStyle.id,
            precinctId: precinct.id,
          })

        break
      }
      case 'pollworker': {
        this.setState({
          ...this.initialCardPresentState,
          isPollWorkerCardPresent: true,
        })
        break
      }
      case 'admin': {
        longValueExists &&
          this.setState({
            ...this.initialCardPresentState,
            isAdminCardPresent: true,
          })
        break
      }
    }
  }

  public stopShortValueReadPolling = () => {
    this.cardPoller?.stop()
    this.cardPoller = undefined
  }

  public startShortValueReadPolling = () => {
    /* istanbul ignore else */
    if (!this.cardPoller) {
      let lastCardDataString = ''

      this.cardPoller = IntervalPoller.start(
        GLOBALS.CARD_POLLING_INTERVAL,
        async () => {
          try {
            const card = await this.props.card.readStatus()
            if (this.state.pauseProcessingUntilNoCardPresent) {
              if (card.present) {
                return
              }
              this.setPauseProcessingUntilNoCardPresent(false)
            }

            // we compare last card and current card without the longValuePresent flag
            // otherwise when we first write the ballot to the card, it reprocesses it
            // and may cause a race condition where an old ballot on the card
            // overwrites a newer one in memory.
            //
            // TODO: embed a card dip UUID in the card data string so even an unlikely
            // identical card swap within 200ms is always detected.
            // https://github.com/votingworks/module-smartcards/issues/59
            const cardCopy = { ...card, longValueExists: undefined }
            const currentCardDataString = JSON.stringify(cardCopy)
            if (currentCardDataString === lastCardDataString) {
              return
            }
            lastCardDataString = currentCardDataString

            if (!card.present || !card.shortValue) {
              // on card removal, special case if we have cardless activation
              const stateToMaintain = this.state.cardlessActivatedAt
                ? {
                    cardlessActivatedAt: this.state.cardlessActivatedAt,
                    precinctId: this.state.precinctId,
                    ballotStyleId: this.state.ballotStyleId!,
                    votes: this.state.votes,
                    contests: this.state.contests,
                  }
                : {}

              this.resetBallot()

              this.setState((prevState) => {
                return {
                  ...prevState,
                  ...stateToMaintain,
                }
              })

              return
            }

            this.processCard(card)
          } catch (error) {
            this.resetBallot()
            lastCardDataString = ''
            this.stopShortValueReadPolling() // Assume backend is unavailable.
          }
        }
      )
    }
  }

  public clearLongValue = async () => {
    this.writingVoteToCard = true
    await this.props.card.writeLongUint8Array(Uint8Array.of())
    this.writingVoteToCard = false
  }

  public startLongValueWritePolling = () => {
    /* istanbul ignore else */
    if (this.cardWriteInterval === 0) {
      this.cardWriteInterval = window.setInterval(async () => {
        if (
          this.state.isVoterCardPresent &&
          this.state.ballotStyleId &&
          this.state.precinctId &&
          ((this.lastVoteSaveToCardAt < this.lastVoteUpdateAt &&
            this.lastVoteUpdateAt <
              Date.now() - GLOBALS.CARD_LONG_VALUE_WRITE_DELAY) ||
            this.forceSaveVoteFlag) &&
          !this.writingVoteToCard
        ) {
          this.lastVoteSaveToCardAt = Date.now()
          this.forceSaveVoteFlag = false

          const election = this.state.electionDefinition!.election
          const ballot: CompletedBallot = {
            ballotId: '',
            ballotStyle: getBallotStyle({
              election,
              ballotStyleId: this.state.ballotStyleId,
            })!,
            precinct: getPrecinctById({
              election,
              precinctId: this.state.precinctId,
            })!,
            votes: this.state.votes ?? blankBallotVotes,
            isTestMode: !this.state.isLiveMode,
            ballotType: BallotType.Standard,
          }
          const longValue = encodeBallot(election, ballot)

          this.writingVoteToCard = true
          try {
            await this.props.card.writeLongUint8Array(longValue)
          } catch (error) {
            // eslint-disable-next-line no-empty
          }
          this.writingVoteToCard = false
        }
      }, GLOBALS.CARD_POLLING_INTERVAL)
    }
  }

  public setPauseProcessingUntilNoCardPresent = (b: boolean) => {
    this.setState({ pauseProcessingUntilNoCardPresent: b })
  }

  public markVoterCardVoided: MarkVoterCardFunction = async () => {
    this.stopShortValueReadPolling()

    await this.clearLongValue()

    const currentVoterCardData: VoterCardData = JSON.parse(
      this.state.shortValue!
    )
    const voidedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      uz: utcTimestamp(),
    }
    await this.writeCard(voidedVoterCardData)

    const updatedCard = await this.readCard()
    const updatedShortValue: VoterCardData =
      updatedCard.present && JSON.parse(updatedCard.shortValue!)

    this.startShortValueReadPolling()

    /* istanbul ignore next - this should never happen */
    if (voidedVoterCardData.uz !== updatedShortValue.uz) {
      this.resetBallot()
      return false
    }
    return true
  }

  public markVoterCardPrinted: MarkVoterCardFunction = async () => {
    this.stopShortValueReadPolling()
    this.setPauseProcessingUntilNoCardPresent(true)

    await this.clearLongValue()

    const currentVoterCardData: VoterCardData = JSON.parse(
      this.state.shortValue!
    )

    const usedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      bp: utcTimestamp(),
    }
    await this.writeCard(usedVoterCardData)

    const updatedCard = await this.readCard()
    const updatedShortValue: VoterCardData =
      updatedCard.present && JSON.parse(updatedCard.shortValue!)

    this.startShortValueReadPolling()

    /* istanbul ignore next - When the card read doesn't match the card write. Currently not possible to test this without separating the write and read into separate methods and updating printing logic. This is an edge case. */
    if (usedVoterCardData.bp !== updatedShortValue.bp) {
      this.resetBallot()
      return false
    }
    return true
  }

  public stopHardwareStatusPolling = () => {
    this.statusPoller?.stop()
    this.statusPoller = undefined

    this.onDeviceChangeSubscription?.unsubscribe()
    this.onDeviceChangeSubscription = undefined
  }

  public startHardwareStatusPolling = () => {
    /* istanbul ignore else */
    if (!this.statusPoller) {
      this.statusPoller = IntervalPoller.start(
        GLOBALS.HARDWARE_POLLING_INTERVAL,
        async () => {
          try {
            const { hardware } = this.props
            const battery = await hardware.readBatteryStatus()
            this.setState({
              hasChargerAttached: !battery.discharging,
              hasLowBattery: battery.level < GLOBALS.LOW_BATTERY_THRESHOLD,
            })
          } catch (error) {
            this.stopHardwareStatusPolling() // Assume backend is unavailable.
          }
        }
      )
    }

    /* istanbul ignore else */
    if (!this.onDeviceChangeSubscription) {
      const { hardware } = this.props

      // watch for changes
      this.onDeviceChangeSubscription = hardware.devices
        .pipe(map((devices) => Array.from(devices)))
        .subscribe(async (devices) => {
          const hasAccessibleControllerAttached = devices.some(
            isAccessibleController
          )
          const hasCardReaderAttached = devices.some(isCardReader)
          const printer = await hardware.readPrinterStatus()
          const hasPrinterAttached = printer.connected

          if (!hasPrinterAttached) {
            this.resetBallot()

            // stop+start forces a last-card-value cache flush
            this.stopShortValueReadPolling()
            this.startShortValueReadPolling()
          }

          this.setState({
            hasAccessibleControllerAttached,
            hasCardReaderAttached,
            hasPrinterAttached,
          })
        })
    }
  }

  public pollWorkerActivateBallot = (ballotStyleId: string) => {
    this.setState((prevState) => {
      const election = prevState.electionDefinition!.election
      const ballotStyle = getBallotStyle({
        election: prevState.electionDefinition!.election,
        ballotStyleId,
      })

      if (election && ballotStyle) {
        return {
          ballotStyleId,
          precinctId: prevState.appPrecinctId,
          contests: getContests({ ballotStyle, election }),
          cardlessActivatedAt: Date.now(),
        }
      } else {
        return {
          ballotStyleId: '',
          precinctId: '',
          contests: [],
          cardlessActivatedAt: 0,
        }
      }
    })
  }

  public componentDidMount = () => {
    const electionDefinition = this.retrieveElection()
    const election = electionDefinition?.election
    const { ballotStyleId, precinctId } = this.retrieveBallotActivation()
    const {
      appPrecinctId = this.initialAppState.appPrecinctId,
      ballotsPrintedCount = this.initialAppState.ballotsPrintedCount,
      isLiveMode = this.initialAppState.isLiveMode,
      isPollsOpen = this.initialAppState.isPollsOpen,
      tally = election ? getZeroTally(election) : this.initialAppState.tally,
    } = this.retrieveAppState()
    const ballotStyle =
      ballotStyleId &&
      election &&
      getBallotStyle({
        ballotStyleId,
        election,
      })
    const contests =
      ballotStyle && election
        ? getContests({ ballotStyle, election })
        : this.initialAppState.contests
    this.setState({
      appPrecinctId,
      ballotsPrintedCount,
      ballotStyleId,
      contests,
      electionDefinition,
      isLiveMode,
      isPollsOpen,
      precinctId,
      tally,
      votes: this.retrieveVotes(),
    })
    document.addEventListener('keydown', handleGamepadKeyboardEvent)
    document.documentElement.setAttribute('data-useragent', navigator.userAgent)
    this.setDocumentFontSize()
    this.setMachineConfig()
    this.startShortValueReadPolling()
    this.startLongValueWritePolling()
    this.startHardwareStatusPolling()
  }

  public componentWillUnmount = /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
    this.machineIdAbortController.abort()
    document.removeEventListener('keydown', handleGamepadKeyboardEvent)
    this.stopShortValueReadPolling()
    this.stopHardwareStatusPolling()
    window.clearInterval(this.cardWriteInterval)
  }

  public render() {
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
      machineConfig,
      hasAccessibleControllerAttached,
      hasCardReaderAttached,
      hasChargerAttached,
      hasLowBattery,
      hasPrinterAttached,
      precinctId,
      tally,
      userSettings,
      cardlessActivatedAt,
      votes,
    } = this.state

    const { appMode } = machineConfig

    if (!hasCardReaderAttached) {
      return <SetupCardReaderPage setUserSettings={this.setUserSettings} />
    }
    if (hasLowBattery && !hasChargerAttached) {
      return <SetupPowerPage setUserSettings={this.setUserSettings} />
    }
    if (isAdminCardPresent) {
      return (
        <AdminScreen
          appMode={appMode}
          appPrecinctId={appPrecinctId}
          ballotsPrintedCount={ballotsPrintedCount}
          electionDefinition={optionalElectionDefinition}
          fetchElection={this.fetchElection}
          isLiveMode={isLiveMode}
          updateAppPrecinctId={this.updateAppPrecinctId}
          toggleLiveMode={this.toggleLiveMode}
          unconfigure={this.unconfigure}
        />
      )
    } else if (optionalElectionDefinition && !!appPrecinctId) {
      const electionDefinition = optionalElectionDefinition!
      if (appMode.isVxPrint && !hasPrinterAttached) {
        return <SetupPrinterPage setUserSettings={this.setUserSettings} />
      }
      if (isPollWorkerCardPresent) {
        const electionDate = new Date(electionDefinition.election.date)
        const isElectionDay = isSameDay(electionDate, new Date())

        return (
          <PollWorkerScreen
            appPrecinctId={appPrecinctId}
            ballotsPrintedCount={ballotsPrintedCount}
            electionDefinition={electionDefinition}
            isLiveMode={isLiveMode}
            isPollsOpen={isPollsOpen}
            isElectionDay={isElectionDay}
            machineConfig={machineConfig}
            printer={this.props.printer}
            tally={tally}
            togglePollsOpen={this.togglePollsOpen}
            enableLiveMode={this.enableLiveMode}
            cardlessActivatedBallotStyleId={
              this.state.cardlessActivatedAt ? this.state.ballotStyleId : ''
            }
            activateBallotStyle={this.pollWorkerActivateBallot}
          />
        )
      }
      if (!isVoterCardValid) {
        return <WrongElectionScreen />
      }
      if (isPollsOpen && isVoterCardVoided) {
        return <ExpiredCardScreen setUserSettings={this.setUserSettings} />
      }
      if (isPollsOpen && isVoterCardPrinted) {
        if (isRecentVoterPrint && appMode.isVxMark && appMode.isVxPrint) {
          return <CastBallotPage />
        } else {
          return <UsedCardScreen setUserSettings={this.setUserSettings} />
        }
      }
      if (isPollsOpen && isVoterCardExpired) {
        return <ExpiredCardScreen setUserSettings={this.setUserSettings} />
      }
      if (isPollsOpen && appMode.isVxPrint && !appMode.isVxMark) {
        return (
          <PrintOnlyScreen
            ballotStyleId={ballotStyleId}
            ballotsPrintedCount={ballotsPrintedCount}
            electionDefinition={electionDefinition}
            isLiveMode={isLiveMode}
            isVoterCardPresent={isVoterCardPresent}
            markVoterCardPrinted={this.markVoterCardPrinted}
            precinctId={precinctId}
            printer={this.props.printer}
            setUserSettings={this.setUserSettings}
            showNoChargerAttachedWarning={!hasChargerAttached}
            updateTally={this.updateTally}
            votes={votes}
          />
        )
      }
      if (isPollsOpen && appMode.isVxMark) {
        if (
          (isVoterCardPresent || cardlessActivatedAt) &&
          ballotStyleId &&
          precinctId
        ) {
          if (appPrecinctId !== precinctId) {
            return <WrongPrecinctScreen />
          }
          return (
            <Gamepad onButtonDown={handleGamepadButtonDown}>
              <BallotContext.Provider
                value={{
                  machineConfig,
                  ballotStyleId,
                  contests,
                  electionDefinition: electionDefinition,
                  updateTally: this.updateTally,
                  isLiveMode,
                  markVoterCardPrinted: cardlessActivatedAt
                    ? async () => true
                    : this.markVoterCardPrinted,
                  markVoterCardVoided: this.markVoterCardVoided,
                  precinctId,
                  printer: this.props.printer,
                  resetBallot: this.resetBallot,
                  setUserSettings: this.setUserSettings,
                  updateVote: this.updateVote,
                  forceSaveVote: this.forceSaveVote,
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

      // font size may have been changed by previous voter, reset to defaults
      this.setDocumentFontSize()

      return (
        <IdleTimer
          onIdle={() => window.kiosk?.quit()}
          timeout={GLOBALS.QUIT_KIOSK_IDLE_SECONDS * 1000}
        >
          <InsertCardScreen
            appPrecinctId={appPrecinctId}
            electionDefinition={electionDefinition}
            showNoAccessibleControllerWarning={
              !!appMode.isVxMark && !hasAccessibleControllerAttached
            }
            showNoChargerAttachedWarning={!hasChargerAttached}
            isLiveMode={isLiveMode}
            isPollsOpen={isPollsOpen}
          />
        </IdleTimer>
      )
    } else {
      return <UnconfiguredScreen />
    }
  }
}

export default AppRoot
