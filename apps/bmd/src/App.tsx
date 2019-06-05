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

import { getBallotStyle, getContests } from './utils/election'

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
  isVoterCardInvalid: boolean
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
  isVoterCardInvalid: false,
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
    const { election } = this.state
    if (!election) {
      return
    }

    const ballotStyle = getBallotStyle({
      ballotStyleId: voterCardData.bs,
      election,
    })
    const precinct = election.precincts.find(pr => pr.id === voterCardData.pr)

    if (ballotStyle && precinct) {
      this.activateBallot({
        ballotStyle,
        precinct,
      })
    } else {
      this.setState({
        isVoterCardInvalid: true,
      })
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
      case 'voter': {
        const voterCardData = cardData as VoterCardData
        const isVoterCardInvalid = !!voterCardData.uz
        this.setState({
          ...defaultCardPresentState,
          isVoterCardPresent: true,
          isVoterCardInvalid,
        })
        if (!isVoterCardInvalid) {
          this.processVoterCardData(voterCardData)
        }
        break
      }
      case 'pollworker': {
        // poll worker admin screen goes here
        this.setState({
          ...defaultCardPresentState,
          isPollWorkerCardPresent: true,
        })
        break
      }
      case 'clerk': {
        if (longValueExists) {
          this.setState({
            ...defaultCardPresentState,
            isClerkCardPresent: true,
          })
        }
        break
      }
    }
  }

  public startPolling = () => {
    let lastCardDataString = ''

    checkCardInterval = window.setInterval(() => {
      fetch('/card/read')
        .then(result => result.json())
        .then(card => {
          // check whether this has changed to reduce work by a lot
          const currentCardDataString = JSON.stringify(card)
          if (currentCardDataString === lastCardDataString) {
            return
          }
          lastCardDataString = currentCardDataString

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
    }, 200)
  }

  public stopPolling = () => {
    window.clearInterval(checkCardInterval)
    this.setState(defaultCardPresentState)
  }

  public markVoterCardUsed = async (
    { ballotPrinted } = { ballotPrinted: true }
  ) => {
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
      bp: ballotPrinted ? 1 : 0,
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
        getBallotStyle({
          ballotStyleId,
          election,
        })
      const contests =
        ballotStyle && election
          ? getContests({ ballotStyle, election })
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
    window.localStorage.removeItem(stateStorageKey)
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

  public activateBallot = ({ ballotStyle, precinct }: ActivationData) => {
    const { election } = this.state
    if (election) {
      this.setBallotActivation({
        ballotStyleId: ballotStyle.id,
        precinctId: precinct.id,
      })
      this.setState({
        ballotStyleId: ballotStyle.id,
        contests: getContests({ ballotStyle, election }),
        precinctId: precinct.id,
      })
    }
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
        isPollsOpen: initialState.isPollsOpen,
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
      isVoterCardInvalid,
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
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={this.togglePollsOpen}
        />
      )
    } else if (election && !isPollsOpen) {
      return <PollsClosedScreen election={election} isLiveMode={isLiveMode} />
    } else if (election) {
      if (
        !isVoterCardInvalid &&
        isVoterCardPresent &&
        ballotStyleId &&
        precinctId
      ) {
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
        return (
          <ActivationScreen
            election={election}
            isLiveMode={isLiveMode}
            isVoterCardInvalid={isVoterCardInvalid}
          />
        )
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
