import Mousetrap from 'mousetrap'
import React from 'react'
// @ts-ignore - @types/react-gamepad doesn't exist
import Gamepad from 'react-gamepad'
import { BrowserRouter, Route, RouteComponentProps } from 'react-router-dom'

import GLOBALS from './config/globals'

import 'normalize.css'
import './App.css'

import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad'

import {
  ActivationData,
  BallotStyle,
  CardData,
  Contests,
  Election,
  ElectionDefaults,
  OptionalElection,
  OptionalVote,
  PartialUserSettings,
  TextSizeSetting,
  UserSettings,
  VoterCardData,
  VotesDict,
} from './config/types'

import Ballot from './components/Ballot'
import Screen from './components/Screen'
import UploadConfig from './components/UploadConfig'
import BallotContext from './contexts/ballotContext'

import ClerkScreen from './pages/ClerkScreen'
import PollWorkerScreen from './pages/PollWorkerScreen'
import PollsClosedScreen from './pages/PollsClosedScreen'
import ActivationScreen from './pages/ActivationScreen'

import electionDefaults from './data/electionDefaults.json'
import electionSample from './data/electionSample.json'

export const mergeWithDefaults = (
  election: Election,
  defaults: ElectionDefaults = electionDefaults
) => ({ ...defaults, ...election })

interface State {
  ballotStyleId: string
  cardData?: CardData
  contests: Contests
  election: OptionalElection
  isClerkCardPresent: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  isPollWorkerCardPresent: boolean
  isVoterCardPresent: boolean
  precinctId: string
  ballotsPrintedCount: number
  userSettings: UserSettings
  votes: VotesDict
}

export const electionStorageKey = 'election'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'
export const stateStorageKey = 'state'
const removeElectionShortcuts = ['mod+k']

const defaultCardPresentState = {
  isClerkCardPresent: false,
  isPollWorkerCardPresent: false,
  isVoterCardPresent: false,
}

const userState = {
  ballotStyleId: '',
  contests: [],
  precinctId: '',
  userSettings: { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
  votes: {},
}

const initialState = {
  ...userState,
  ...defaultCardPresentState,
  ballotsPrintedCount: 0,
  election: undefined,
  isLiveMode: false,
  isPollsOpen: false,
}

interface CompleteCardData {
  cardData: CardData
  longValueExists: boolean
}

let checkCardInterval = 0

export class App extends React.Component<RouteComponentProps, State> {
  public state: State = initialState

  public processVoterCardData = (voterCardData: VoterCardData) => {
    if (!this.state.election) {
      return
    }

    // better UI at some point
    // don't reuse a card that has been written
    if (voterCardData.uz) {
      return
    }

    const ballotStyle = this.state.election.ballotStyles.find(
      bs => voterCardData.bs === bs.id
    )
    const precinct = this.state.election.precincts.find(
      pr => pr.id === voterCardData.pr
    )

    if (ballotStyle && precinct) {
      const activationData: ActivationData = {
        ballotStyle,
        precinct,
      }
      this.activateBallot(activationData)
    }
  }

  public fetchElection = async () => {
    fetch('/card/read_long')
      .then(result => result.json())
      .then(election => {
        this.setElection(JSON.parse(election.longValue))
      })
  }

  public processCardData = (completeCardData: CompleteCardData) => {
    const { cardData, longValueExists } = completeCardData
    switch (cardData.t) {
      case 'voter':
        this.setState({
          ...defaultCardPresentState,
          isVoterCardPresent: true,
        })
        this.processVoterCardData(cardData as VoterCardData)
        break
      case 'pollworker':
        // poll worker admin screen goes here
        this.setState({
          ...defaultCardPresentState,
          isPollWorkerCardPresent: true,
        })
        break
      case 'clerk':
        if (longValueExists) {
          this.setState({
            ...defaultCardPresentState,
            isClerkCardPresent: true,
          })
        }
        break
    }
  }

  public startPolling = () => {
    checkCardInterval = window.setInterval(() => {
      fetch('/card/read')
        .then(result => result.json())
        .then(card => {
          const { isVoterCardPresent } = this.state
          if (isVoterCardPresent && !card.present) {
            this.resetBallot()
            return
          }

          if (card.shortValue) {
            const cardData = JSON.parse(card.shortValue) as CardData
            this.processCardData({
              cardData: cardData,
              longValueExists: card.longValueExists,
            })
          } else {
            this.setState({
              ...defaultCardPresentState,
            })
          }
        })
        .catch(() => {
          // if it's an error, aggressively assume there's no backend and stop hammering
          this.stopPolling()
        })
    }, 1000)
  }

  public stopPolling = () => {
    window.clearInterval(checkCardInterval)
    this.setState(defaultCardPresentState)
  }

  public markVoterCardUsed = async () => {
    // this is a demo with no card reader attached
    // TODO: limit this to demo elections
    // https://github.com/votingworks/bmd/issues/390
    if (!this.state.isVoterCardPresent) {
      return true
    }

    const { ballotStyleId, precinctId } = this.getBallotActivation()

    const newCardData: VoterCardData = {
      bs: ballotStyleId,
      pr: precinctId,
      t: 'voter',
      uz: new Date().getTime(),
    }

    const newCardDataSerialized = JSON.stringify(newCardData)

    await fetch('/card/write', {
      method: 'post',
      body: newCardDataSerialized,
      headers: { 'Content-Type': 'application/json' },
    })

    const readCheck = await fetch('/card/read')
    const readCheckObj = await readCheck.json()

    return readCheckObj.shortValue === newCardDataSerialized
  }

  public componentDidMount = () => {
    if (window.location.hash === '#sample') {
      this.setState({
        election: mergeWithDefaults(electionSample as Election),
      })
    } else {
      const election = this.getElection()
      const { ballotStyleId, precinctId } = this.getBallotActivation()
      const {
        ballotsPrintedCount = initialState.ballotsPrintedCount,
        isLiveMode = initialState.isLiveMode,
        isPollsOpen = initialState.isPollsOpen,
      } = this.getStoredState()
      const ballotStyle =
        ballotStyleId &&
        election &&
        election.ballotStyles.find(bs => bs.id === ballotStyleId)
      const contests = ballotStyle
        ? this.getContests(ballotStyle, election)
        : initialState.contests
      this.setState({
        ballotsPrintedCount,
        ballotStyleId,
        contests,
        election,
        isLiveMode,
        isPollsOpen,
        precinctId,
        votes: this.getVotes(),
      })
    }
    Mousetrap.bind(removeElectionShortcuts, this.unconfigure)
    document.addEventListener('keydown', handleGamepadKeyboardEvent)
    document.documentElement.setAttribute('data-useragent', navigator.userAgent)
    this.setDocumentFontSize()

    this.startPolling()
  }

  public componentWillUnount = /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
    Mousetrap.unbind(removeElectionShortcuts)
    document.removeEventListener('keydown', handleGamepadKeyboardEvent)
    window.clearInterval(checkCardInterval)
  }

  public getElection = (): OptionalElection => {
    const election = window.localStorage.getItem(electionStorageKey)
    return election ? JSON.parse(election) : undefined
  }

  public setElection = (electionConfigFile: Election) => {
    const election = mergeWithDefaults(electionConfigFile)
    this.setState({ election })
    window.localStorage.setItem(electionStorageKey, JSON.stringify(election))
  }

  public getBallotActivation = () => {
    const voterData = window.localStorage.getItem(activationStorageKey)
    return voterData ? JSON.parse(voterData) : {}
  }

  public setBallotActivation = (data: {
    ballotStyleId: string
    precinctId: string
  }) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      window.localStorage.setItem(activationStorageKey, JSON.stringify(data))
    }
  }

  public getVotes = () => {
    const votesData = window.localStorage.getItem(votesStorageKey)
    return votesData ? JSON.parse(votesData) : {}
  }

  public setVotes = (votes: VotesDict) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      window.localStorage.setItem(votesStorageKey, JSON.stringify(votes))
    }
  }

  public resetVoterData = () => {
    window.localStorage.removeItem(activationStorageKey)
    window.localStorage.removeItem(votesStorageKey)
  }

  public unconfigure = /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
    this.setState(initialState)
    window.localStorage.removeItem(electionStorageKey)
    this.resetVoterData()
    this.props.history.push('/')
  }

  public setStoredState = () => {
    const { ballotsPrintedCount, isLiveMode, isPollsOpen } = this.state
    window.localStorage.setItem(
      stateStorageKey,
      JSON.stringify({
        ballotsPrintedCount,
        isLiveMode,
        isPollsOpen,
      })
    )
  }

  public getStoredState = () => {
    const storedState = window.localStorage.getItem(stateStorageKey)
    return storedState ? JSON.parse(storedState) : {}
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

  public resetBallot = (path: string = '/') => {
    this.resetVoterData()
    this.setState(userState, () => {
      this.setStoredState()
      this.props.history.push(path)
    })
  }

  public getContests = (ballotStyle: BallotStyle, election?: Election) =>
    (election || this.state.election!).contests.filter(
      c =>
        ballotStyle.districts.includes(c.districtId) &&
        ballotStyle.partyId === c.partyId
    )

  public activateBallot = ({ ballotStyle, precinct }: ActivationData) => {
    this.setBallotActivation({
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
    })
    this.setState({
      ballotStyleId: ballotStyle.id,
      contests: this.getContests(ballotStyle),
      precinctId: precinct.id,
    })
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
        }
      }
    )
  }

  public setDocumentFontSize = (textSize: number = GLOBALS.TEXT_SIZE) => {
    document.documentElement.style.fontSize = `${
      GLOBALS.FONT_SIZES[textSize]
    }px`
  }

  public toggleLiveMode = () => {
    this.setState(
      prevState => ({
        isLiveMode: !prevState.isLiveMode,
        ballotsPrintedCount: initialState.ballotsPrintedCount,
      }),
      this.setStoredState
    )
  }

  public togglePollsOpen = () => {
    this.setState(
      prevState => ({ isPollsOpen: !prevState.isPollsOpen }),
      this.setStoredState
    )
  }

  public incrementBallotsPrintedCount = () => {
    this.setState(
      prevState => ({
        ballotsPrintedCount: prevState.ballotsPrintedCount + 1,
      }),
      this.setStoredState
    )
  }

  public componentDidCatch() {
    this.unconfigure()
    window.location.reload()
  }

  public render() {
    const {
      ballotsPrintedCount,
      ballotStyleId,
      contests,
      election,
      isClerkCardPresent,
      isLiveMode,
      isPollsOpen,
      isPollWorkerCardPresent,
      isVoterCardPresent,
      precinctId,
      userSettings,
      votes,
    } = this.state
    if (isClerkCardPresent) {
      return (
        <ClerkScreen
          ballotsPrintedCount={ballotsPrintedCount}
          election={election}
          fetchElection={this.fetchElection}
          isLiveMode={isLiveMode}
          unconfigure={this.unconfigure}
          toggleLiveMode={this.toggleLiveMode}
        />
      )
    } else if (election && isPollWorkerCardPresent) {
      return (
        <PollWorkerScreen
          ballotsPrintedCount={ballotsPrintedCount}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={this.togglePollsOpen}
        />
      )
    } else if (election && !isPollsOpen) {
      return <PollsClosedScreen />
    } else if (election) {
      if (isVoterCardPresent && ballotStyleId && precinctId) {
        return (
          <Gamepad onButtonDown={handleGamepadButtonDown}>
            <BallotContext.Provider
              value={{
                activateBallot: this.activateBallot,
                ballotStyleId,
                contests,
                election,
                incrementBallotsPrintedCount: this.incrementBallotsPrintedCount,
                isLiveMode,
                markVoterCardUsed: this.markVoterCardUsed,
                precinctId,
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
      } else {
        return <ActivationScreen />
      }
    } else {
      return <UploadConfig setElection={this.setElection} />
    }
  }
}

const Root = () => (
  <BrowserRouter>
    <Screen>
      <Route path="/" component={App} />
    </Screen>
  </BrowserRouter>
)

export default Root
