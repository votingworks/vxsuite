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
  loadingElection: boolean
  precinctId: string
  userSettings: UserSettings
  votes: VotesDict
}

export const electionKey = 'election'
export const activationStorageKey = 'activation'
export const votesStorageKey = 'votes'
const removeElectionShortcuts = ['mod+k']

const initialState = {
  ballotStyleId: '',
  contests: [],
  election: undefined,
  loadingElection: false,
  precinctId: '',
  userSettings: { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
  votes: {},
}

interface CompleteCardData {
  cardData: CardData
  longValueExists: boolean
}

let checkCardInterval = 0
let cardReaderAttached = true

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

  public processCardData = (completeCardData: CompleteCardData) => {
    const { cardData, longValueExists } = completeCardData

    switch (cardData.t) {
      case 'voter':
        this.processVoterCardData(cardData as VoterCardData)
        break
      case 'pollworker':
        // poll worker admin screen goes here
        break
      case 'clerk':
        if (
          !this.state.election &&
          longValueExists &&
          !this.state.loadingElection
        ) {
          this.setState({ loadingElection: true })
          this.fetchElection().then(election => {
            // setTimeout to prevent tests from going into infinite loops
            window.setTimeout(() => {
              this.setElection(JSON.parse(election.longValue))
            }, 0)
          })
        }
        break
    }
  }

  public fetchElection = async () => {
    return fetch('/card/read_long').then(result => result.json())
  }

  public startPolling = () => {
    checkCardInterval = window.setInterval(() => {
      fetch('/card/read')
        .then(result => result.json())
        .then(resultJSON => {
          // card was just taken out
          const { ballotStyleId } = this.getBallotActivation()
          if (!resultJSON.present && ballotStyleId) {
            this.resetBallot()
            return
          }

          if (resultJSON.shortValue) {
            const cardData = JSON.parse(resultJSON.shortValue) as CardData
            this.processCardData({
              cardData: cardData,
              longValueExists: resultJSON.longValueExists,
            })
          }
        })
        .catch(() => {
          // if it's an error, aggressively assume there's no backend and stop hammering
          this.stopPolling()
          cardReaderAttached = false
        })
    }, 200)
  }

  public stopPolling = () => {
    window.clearInterval(checkCardInterval)
  }

  public markVoterCardUsed = async () => {
    // this is a demo with no card reader attached
    // TODO: limit this to demo elections
    // https://github.com/votingworks/bmd/issues/390
    if (!cardReaderAttached) {
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
      const ballotStyle =
        ballotStyleId &&
        election &&
        election.ballotStyles.find(bs => bs.id === ballotStyleId)
      const contests = ballotStyle
        ? this.getContests(ballotStyle, election)
        : initialState.contests
      this.setState({
        ballotStyleId,
        contests,
        election,
        precinctId,
        votes: this.getVotes(),
      })
    }
    Mousetrap.bind(removeElectionShortcuts, this.reset)
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
    const election = window.localStorage.getItem(electionKey)
    return election ? JSON.parse(election) : undefined
  }

  public setElection = (electionConfigFile: Election) => {
    const election = mergeWithDefaults(electionConfigFile)
    this.setState({ election, loadingElection: false })
    window.localStorage.setItem(electionKey, JSON.stringify(election))
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

  public reset = /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
    this.setState(initialState)
    window.localStorage.removeItem(electionKey)
    this.resetVoterData()
    this.props.history.push('/')
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
    this.setState(
      {
        ...initialState,
        election: this.getElection(),
      },
      () => {
        this.props.history.push(path)
      }
    )
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

  public componentDidCatch() {
    this.reset()
    window.location.reload()
  }

  public render() {
    const { election } = this.state
    if (!election) {
      return <UploadConfig setElection={this.setElection} />
    } else {
      return (
        <Gamepad onButtonDown={handleGamepadButtonDown}>
          <BallotContext.Provider
            value={{
              activateBallot: this.activateBallot,
              ballotStyleId: this.state.ballotStyleId,
              contests: this.state.contests,
              election,
              markVoterCardUsed: this.markVoterCardUsed,
              precinctId: this.state.precinctId,
              resetBallot: this.resetBallot,
              setUserSettings: this.setUserSettings,
              updateVote: this.updateVote,
              userSettings: this.state.userSettings,
              votes: this.state.votes,
            }}
          >
            <Ballot />
          </BallotContext.Provider>
        </Gamepad>
      )
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
