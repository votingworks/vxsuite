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
  OptionalElection,
} from '@votingworks/ballot-encoder'
import 'normalize.css'
import React from 'react'
import Gamepad from 'react-gamepad'
import { RouteComponentProps } from 'react-router-dom'
import './App.css'
import Ballot from './components/Ballot'
import * as GLOBALS from './config/globals'
import {
  ActivationData,
  AppMode,
  AppModeNames,
  CardAPI,
  CardData,
  CardPresentAPI,
  MachineIdAPI,
  MarkVoterCardFunction,
  PartialUserSettings,
  UserSettings,
  VoterCardData,
  VxMarkOnly,
  VxMarkPlusVxPrint,
  VxPrintOnly,
  Tally,
  CandidateVoteTally,
  getAppMode,
  YesNoVoteTally,
  SerializableActivationData,
} from './config/types'
import BallotContext from './contexts/ballotContext'
import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad'
import CastBallotPage from './pages/CastBallotPage'
import ClerkScreen from './pages/ClerkScreen'
import ExpiredCardScreen from './pages/ExpiredCardScreen'
import InvalidCardScreen from './pages/InvalidCardScreen'
import InsertCardScreen from './pages/InsertCardScreen'
import PollWorkerScreen from './pages/PollWorkerScreen'
import PrintOnlyScreen from './pages/PrintOnlyScreen'
import SetupCardReaderPage from './pages/SetupCardReaderPage'
import SetupPrinterPage from './pages/SetupPrinterPage'
import SetupPowerPage from './pages/SetupPowerPage'
import UnconfiguredScreen from './pages/UnconfiguredScreen'
import UsedCardScreen from './pages/UsedCardScreen'
import { getBallotStyle, getContests, getZeroTally } from './utils/election'
import fetchJSON from './utils/fetchJSON'
import { Printer } from './utils/printer'
import utcTimestamp from './utils/utcTimestamp'
import { Card } from './utils/Card'
import { Poller, IntervalPoller } from './utils/polling'
import { Storage } from './utils/Storage'
import { Hardware } from './utils/Hardware'

interface CardState {
  isClerkCardPresent: boolean
  isPollWorkerCardPresent: boolean
  isRecentVoterPrint: boolean
  isVoterCardExpired: boolean
  isVoterCardVoided: boolean
  isVoterCardPresent: boolean
  isVoterCardPrinted: boolean
  pauseProcessingUntilNoCardPresent: boolean
  voterCardCreatedAt: number
}

interface UserState {
  ballotCreatedAt: number
  ballotStyleId: string
  contests: Contests
  precinctId: string
  userSettings: UserSettings
  votes: VotesDict
}

interface SharedState {
  appMode: AppMode
  appPrecinctId: string
  ballotsPrintedCount: number
  election: OptionalElection
  hasAccessibleControllerAttached: boolean
  hasCardReaderAttached: boolean
  hasChargerAttached: boolean
  hasLowBattery: boolean
  hasPrinterAttached: boolean
  isFetchingElection: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  machineId: string
  shortValue?: string
  tally: Tally
}

export interface State extends CardState, UserState, SharedState {}

export interface AppStorage {
  election?: Election
  state?: Partial<State>
  activation?: SerializableActivationData
  votes?: VotesDict
}

export interface Props extends RouteComponentProps {
  hardware: Hardware
  card: Card
  storage: Storage<AppStorage>
  printer: Printer
}

export const electionStorageKey = 'election'
export const stateStorageKey = 'state'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'

class AppRoot extends React.Component<Props, State> {
  private machineIdAbortController = new AbortController()

  private cardPoller?: Poller
  private statusPoller?: Poller
  private lastVoteUpdateAt = 0
  private lastVoteSaveToCardAt = 0
  private cardWriteInterval = 0
  private writingVoteToCard = false

  private initialCardPresentState: CardState = {
    isClerkCardPresent: false,
    isPollWorkerCardPresent: false,
    isRecentVoterPrint: false,
    isVoterCardExpired: false,
    isVoterCardVoided: false,
    isVoterCardPresent: false,
    isVoterCardPrinted: false,
    pauseProcessingUntilNoCardPresent: false,
    voterCardCreatedAt: 0,
  }

  private initialUserState: UserState = {
    ballotCreatedAt: 0,
    ballotStyleId: '',
    contests: [],
    precinctId: '',
    userSettings: { textSize: GLOBALS.TEXT_SIZE },
    votes: {},
  }

  private sharedState: SharedState = {
    appMode: VxMarkOnly,
    appPrecinctId: '',
    ballotsPrintedCount: 0,
    election: undefined,
    hasAccessibleControllerAttached: true,
    hasCardReaderAttached: true,
    hasChargerAttached: true,
    hasLowBattery: false,
    hasPrinterAttached: true,
    isFetchingElection: false,
    isLiveMode: false,
    isPollsOpen: false,
    machineId: '---',
    shortValue: '{}',
    tally: [],
  }

  private initialState: State = {
    ...this.initialUserState,
    ...this.initialCardPresentState,
    ...this.sharedState,
  }

  public state = this.initialState

  public processVoterCardData = (voterCardData: VoterCardData) => {
    const election = this.state.election!
    const ballotStyle = getBallotStyle({
      ballotStyleId: voterCardData.bs,
      election,
    })
    const precinct = election.precincts.find(pr => pr.id === voterCardData.pr)!
    this.activateBallot({
      ballotCreatedAt: voterCardData.c,
      ballotStyle,
      precinct,
    })
  }

  public fetchElection = async () => {
    this.setState({ isFetchingElection: true })
    try {
      this.setElection((await this.props.card.readLongObject<Election>())!)
    } finally {
      this.setState({ isFetchingElection: false })
    }
  }

  public fetchBallotData = async () => {
    const longValue = (await this.props.card.readLongUint8Array())!
    /* istanbul ignore else */
    if (longValue) {
      const election = this.state.election!
      const { ballot } = decodeBallot(election, longValue)
      return ballot
    } else {
      return undefined
    }
  }

  public isVoterCardExpired = (
    prevCreatedAt: number,
    createdAt: number
  ): boolean => {
    return (
      prevCreatedAt === 0 &&
      utcTimestamp() >= createdAt + GLOBALS.CARD_EXPIRATION_SECONDS
    )
  }

  public isRecentVoterPrint = (isPrinted: boolean, printedTime: number) => {
    return (
      isPrinted &&
      utcTimestamp() <= printedTime + GLOBALS.RECENT_PRINT_EXPIRATION_SECONDS
    )
  }

  public processCard = async ({
    longValueExists,
    shortValue,
  }: CardPresentAPI) => {
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
        const isRecentVoterPrint = this.isRecentVoterPrint(
          isVoterCardPrinted,
          ballotPrintedTime
        )

        const ballot: Partial<CompletedBallot> =
          (longValueExists &&
            !this.state.isVoterCardExpired &&
            !this.state.isVoterCardVoided &&
            (await this.fetchBallotData())) ||
          {}

        this.setState(
          prevState => {
            const isVoterCardExpired = this.isVoterCardExpired(
              prevState.voterCardCreatedAt,
              voterCardCreatedAt
            )
            return {
              ...this.initialCardPresentState,
              shortValue,
              isVoterCardExpired,
              isVoterCardVoided,
              isVoterCardPresent: true,
              isVoterCardPrinted,
              isRecentVoterPrint,
              voterCardCreatedAt,
              ballotStyleId:
                ballot.ballotStyle?.id ?? this.initialState.ballotStyleId,
              votes: ballot.votes ?? {},
            }
          },
          () => {
            const {
              isVoterCardExpired,
              isVoterCardVoided,
              isVoterCardPrinted,
            } = this.state
            if (
              !isVoterCardExpired &&
              !isVoterCardVoided &&
              !isVoterCardPrinted
            ) {
              this.processVoterCardData(voterCardData)
            }
          }
        )

        break
      }
      case 'pollworker': {
        this.setState({
          ...this.initialCardPresentState,
          isPollWorkerCardPresent: true,
        })
        break
      }
      case 'clerk': {
        longValueExists &&
          this.setState({
            ...this.initialCardPresentState,
            isClerkCardPresent: true,
          })
        break
      }
    }
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
            const currentCardDataString = JSON.stringify(card)
            if (currentCardDataString === lastCardDataString) {
              return
            }
            lastCardDataString = currentCardDataString

            if (!card.present || !card.shortValue) {
              this.resetBallot()
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

  public stopShortValueReadPolling = () => {
    this.cardPoller && this.cardPoller.stop()
    this.cardPoller = undefined
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
          this.lastVoteSaveToCardAt < this.lastVoteUpdateAt &&
          this.lastVoteUpdateAt <
            Date.now() - GLOBALS.CARD_LONG_VALUE_WRITE_DELAY &&
          !this.writingVoteToCard
        ) {
          this.lastVoteSaveToCardAt = Date.now()

          const election = this.state.election!
          const ballot: CompletedBallot = {
            election,
            ballotId: '',
            ballotStyle: getBallotStyle({
              election,
              ballotStyleId: this.state.ballotStyleId,
            })!,
            precinct: getPrecinctById({
              election,
              precinctId: this.state.precinctId,
            })!,
            votes: this.state.votes,
            isTestBallot: !this.state.isLiveMode,
            ballotType: BallotType.Standard,
          }
          const longValue = encodeBallot(ballot)

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

  public startHardwareStatusPolling = () => {
    /* istanbul ignore else */
    if (!this.statusPoller) {
      this.statusPoller = IntervalPoller.start(
        GLOBALS.CARD_POLLING_INTERVAL,
        async () => {
          try {
            // Possible implementation
            const { hardware } = this.props
            const accesssibleController = await hardware.readAccesssibleControllerStatus()
            const battery = await hardware.readBatteryStatus()
            const cardReader = await hardware.readCardReaderStatus()
            const printer = await hardware.readPrinterStatus()
            this.setState({
              hasAccessibleControllerAttached: accesssibleController.connected,
              hasCardReaderAttached: cardReader.connected,
              hasChargerAttached: !battery.discharging,
              hasLowBattery: battery.level < GLOBALS.LOW_BATTERY_THRESHOLD,
              hasPrinterAttached: printer.connected,
            })
          } catch (error) {
            this.stopHardwareStatusPolling() // Assume backend is unavailable.
          }
        }
      )
    }
  }

  public stopHardwareStatusPolling = () => {
    this.statusPoller?.stop()
    this.statusPoller = undefined
  }

  public componentDidMount = () => {
    const election = this.getElection()
    const { ballotStyleId, precinctId } = this.getBallotActivation()
    const {
      appMode = this.initialState.appMode,
      appPrecinctId = this.initialState.appPrecinctId,
      ballotsPrintedCount = this.initialState.ballotsPrintedCount,
      isLiveMode = this.initialState.isLiveMode,
      isPollsOpen = this.initialState.isPollsOpen,
      tally = this.initialState.tally,
    } = this.getStoredState()
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
        : this.initialState.contests
    this.setState({
      appMode,
      appPrecinctId,
      ballotsPrintedCount,
      ballotStyleId,
      contests,
      election,
      isLiveMode,
      isPollsOpen,
      precinctId,
      tally,
      votes: this.getVotes(),
    })
    document.addEventListener('keydown', handleGamepadKeyboardEvent)
    document.documentElement.setAttribute('data-useragent', navigator.userAgent)
    this.setDocumentFontSize()
    this.setMachineId()
    this.startShortValueReadPolling()
    this.startLongValueWritePolling()
    this.startHardwareStatusPolling()
  }

  public componentWillUnmount = /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
    this.machineIdAbortController.abort()
    document.removeEventListener('keydown', handleGamepadKeyboardEvent)
    this.stopShortValueReadPolling()
    this.stopHardwareStatusPolling()
  }

  public setMachineId = async () => {
    const { signal } = this.machineIdAbortController
    try {
      const { machineId } = await fetchJSON<MachineIdAPI>('/machine-id', {
        signal,
      })
      machineId && this.setState({ machineId })
    } catch (error) {
      // TODO: what should happen if `machineId` is not returned?
    }
  }

  public readCard = async (): Promise<CardAPI> => {
    return await this.props.card.readStatus()
  }

  public writeCard = async (cardData: VoterCardData) => {
    await this.props.card.writeShortValue(JSON.stringify(cardData))
  }

  public getElection = (): OptionalElection => {
    return this.props.storage.get(electionStorageKey)
  }

  public setElection = (electionConfigFile: Election) => {
    const election = electionConfigFile
    this.setState({ election }, this.resetTally)
    this.props.storage.set(electionStorageKey, election)
  }

  public getBallotActivation = (): SerializableActivationData => {
    return (
      this.props.storage.get(activationStorageKey) ||
      (({} as unknown) as SerializableActivationData)
    )
  }

  public setBallotActivation = (data: SerializableActivationData) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      this.props.storage.set(activationStorageKey, data)
    }
  }

  public getVotes = () => {
    return this.props.storage.get(votesStorageKey) || {}
  }

  public setVotes = async (votes: VotesDict) => {
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
    this.setState(this.initialState)
    this.props.storage.clear()
    this.props.history.push('/')
  }

  public setStoredState = () => {
    const {
      appMode,
      appPrecinctId,
      ballotsPrintedCount,
      isLiveMode,
      isPollsOpen,
      tally,
    } = this.state
    this.props.storage.set(stateStorageKey, {
      appMode,
      appPrecinctId,
      ballotsPrintedCount,
      isLiveMode,
      isPollsOpen,
      tally,
    })
  }

  public getStoredState = (): Partial<State> => {
    const storedState = this.props.storage.get(stateStorageKey) || {}

    if (storedState.appMode) {
      try {
        storedState.appMode = getAppMode(storedState.appMode.name)
      } catch {
        /* istanbul ignore next */

        delete storedState.appMode
      }
    }

    return storedState
  }

  public updateVote = (contestId: string, vote: OptionalVote) => {
    this.setState(
      prevState => ({
        votes: { ...prevState.votes, [contestId]: vote },
      }),
      () => {
        this.setVotes(this.state.votes)
      }
    )
  }

  public resetBallot = (path = '/') => {
    this.resetVoterData()
    this.setState(
      {
        ...this.initialCardPresentState,
        ...this.initialUserState,
      },
      () => {
        this.setStoredState()
        this.props.history.push(path)
      }
    )
  }

  public activateBallot = ({
    ballotCreatedAt,
    ballotStyle,
    precinct,
  }: ActivationData) => {
    this.setBallotActivation({
      ballotCreatedAt,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
    })
    this.setState(prevState => ({
      ballotStyleId: ballotStyle.id,
      contests: getContests({ ballotStyle, election: prevState.election! }),
      precinctId: precinct.id,
    }))
  }

  public setUserSettings = (partial: PartialUserSettings) => {
    this.setState(
      prevState => ({
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

  public setAppMode = (appModeName: AppModeNames) => {
    const appMode = getAppMode(appModeName)
    this.setState({ appMode }, this.resetTally)
  }

  public setAppPrecinctId = (appPrecinctId: string) => {
    this.setState({ appPrecinctId }, this.resetTally)
  }

  public toggleLiveMode = () => {
    this.setState(
      prevState => ({
        isLiveMode: !prevState.isLiveMode,
        isPollsOpen: this.initialState.isPollsOpen,
      }),
      this.resetTally
    )
  }

  public togglePollsOpen = () => {
    this.setState(
      prevState => ({ isPollsOpen: !prevState.isPollsOpen }),
      this.setStoredState
    )
  }

  public resetTally = () => {
    this.setState(
      ({ election }) => ({
        ballotsPrintedCount: this.initialState.ballotsPrintedCount,
        tally: getZeroTally(election!),
      }),
      this.setStoredState
    )
  }

  public updateTally = () => {
    this.setState(
      ({ ballotsPrintedCount, election: e, tally: prevTally, votes }) => {
        const tally = prevTally
        const election = e!
        for (const contestId in votes) {
          const contestIndex = election.contests.findIndex(
            c => c.id === contestId
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
            yesnoContestTally[vote]++
          } else if (contest.type === 'candidate') {
            const candidateContestTally = contestTally as CandidateVoteTally
            const vote = votes[contestId] as CandidateVote
            vote.forEach(candidate => {
              if (candidate.isWriteIn) {
                const tallyContestWriteIns = candidateContestTally.writeIns
                const writeIn = tallyContestWriteIns.find(
                  c => c.name === candidate.name
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
                  c => c.id === candidate.id
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
      this.setStoredState
    )
  }

  public render() {
    const {
      appMode,
      appPrecinctId,
      ballotsPrintedCount,
      ballotStyleId,
      contests,
      election: optionalElection,
      isClerkCardPresent,
      isLiveMode,
      isPollsOpen,
      isPollWorkerCardPresent,
      isVoterCardPresent,
      isVoterCardExpired,
      isVoterCardVoided,
      isVoterCardPrinted,
      isRecentVoterPrint,
      machineId,
      hasAccessibleControllerAttached,
      hasCardReaderAttached,
      hasChargerAttached,
      hasLowBattery,
      hasPrinterAttached,
      precinctId,
      tally,
      userSettings,
      votes,
    } = this.state
    if (hasLowBattery && !hasChargerAttached) {
      return <SetupPowerPage setUserSettings={this.setUserSettings} />
    }
    if (!hasCardReaderAttached) {
      return <SetupCardReaderPage setUserSettings={this.setUserSettings} />
    }
    if (appMode.isVxPrint) {
      if (!hasPrinterAttached) {
        return <SetupPrinterPage setUserSettings={this.setUserSettings} />
      }
    }
    if (isClerkCardPresent) {
      return (
        <ClerkScreen
          appMode={appMode}
          appPrecinctId={appPrecinctId}
          ballotsPrintedCount={ballotsPrintedCount}
          election={optionalElection}
          fetchElection={this.fetchElection}
          isFetchingElection={this.state.isFetchingElection}
          isLiveMode={isLiveMode}
          setAppMode={this.setAppMode}
          setAppPrecinctId={this.setAppPrecinctId}
          toggleLiveMode={this.toggleLiveMode}
          unconfigure={this.unconfigure}
        />
      )
    } else if (optionalElection && !!appPrecinctId) {
      const election = optionalElection as Election
      if (isPollWorkerCardPresent) {
        return (
          <PollWorkerScreen
            appMode={appMode}
            appPrecinctId={appPrecinctId}
            ballotsPrintedCount={ballotsPrintedCount}
            election={election}
            isLiveMode={isLiveMode}
            isPollsOpen={isPollsOpen}
            machineId={machineId}
            printer={this.props.printer}
            tally={tally}
            togglePollsOpen={this.togglePollsOpen}
          />
        )
      }
      if (isPollsOpen && isVoterCardVoided) {
        return <ExpiredCardScreen setUserSettings={this.setUserSettings} />
      }
      if (isPollsOpen && isVoterCardPrinted) {
        if (isRecentVoterPrint && appMode === VxMarkPlusVxPrint) {
          return <CastBallotPage />
        } else {
          return <UsedCardScreen setUserSettings={this.setUserSettings} />
        }
      }
      if (isPollsOpen && isVoterCardExpired) {
        return <ExpiredCardScreen setUserSettings={this.setUserSettings} />
      }
      if (isPollsOpen && appMode === VxPrintOnly) {
        return (
          <PrintOnlyScreen
            ballotStyleId={ballotStyleId}
            election={election}
            isLiveMode={isLiveMode}
            isVoterCardPresent={isVoterCardPresent}
            markVoterCardPrinted={this.markVoterCardPrinted}
            precinctId={precinctId}
            printer={this.props.printer}
            setUserSettings={this.setUserSettings}
            updateTally={this.updateTally}
            votes={votes}
          />
        )
      }
      if (isPollsOpen && appMode.isVxMark) {
        if (isVoterCardPresent && ballotStyleId && precinctId) {
          if (appPrecinctId !== precinctId) {
            return <InvalidCardScreen />
          }
          return (
            <Gamepad onButtonDown={handleGamepadButtonDown}>
              <BallotContext.Provider
                value={{
                  activateBallot: this.activateBallot,
                  appMode,
                  ballotStyleId,
                  contests,
                  election,
                  updateTally: this.updateTally,
                  isLiveMode,
                  markVoterCardPrinted: this.markVoterCardPrinted,
                  markVoterCardVoided: this.markVoterCardVoided,
                  precinctId,
                  printer: this.props.printer,
                  resetBallot: this.resetBallot,
                  setUserSettings: this.setUserSettings,
                  updateVote: this.updateVote,
                  userSettings,
                  votes,
                }}
              >
                <Ballot />
              </BallotContext.Provider>
            </Gamepad>
          )
        }
      }
      return (
        <InsertCardScreen
          appPrecinctId={appPrecinctId}
          election={election}
          showNoAccessibleControllerWarning={
            !!appMode.isVxMark && !hasAccessibleControllerAttached
          }
          showNoChargerAttachedWarning={!hasChargerAttached}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
        />
      )
    } else {
      return <UnconfiguredScreen />
    }
  }
}

export default AppRoot
