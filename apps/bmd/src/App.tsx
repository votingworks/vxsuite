import Mousetrap from 'mousetrap'
import React from 'react'
import { BrowserRouter } from 'react-router-dom'

// Enable to view the event atrributes
// document.addEventListener('keydown', event => {
//   console.log('==============================')
//   console.log('==============================')
//   console.log('==============================')
//   console.log('Event:', event)
//   console.log('Keyboard Event object keys:', {
//     charCode: event.charCode,
//     code: event.code,
//     key: event.key,
//     keyCode: event.keyCode,
//     metaKey: event.metaKey,
//   })
//   console.log('==============================')
//   console.log('==============================')
//   console.log('==============================')
// })

import 'normalize.css'
import './App.css'

import { Election, OptionalElection, Vote, VoteDict } from './config/types'

import sampleElection from './data/election.json'

import Ballot from './components/Ballot'
import UploadConfig from './components/UploadConfig'
import BallotContext from './contexts/ballotContext'

interface State {
  election: OptionalElection
  votes: VoteDict
}

export const electionKey = 'votingWorksElection'
const removeElectionShortcuts = ['mod+k']

const initialState = {
  election: undefined,
  votes: {},
}

class App extends React.Component<{}, State> {
  public state: State = initialState

  public componentDidMount = () => {
    if (window.location.hash === '#sample') {
      this.setState({
        election: sampleElection,
      })
    } else {
      this.setState({
        election: this.getElection(),
      })
    }
    Mousetrap.bind(removeElectionShortcuts, this.removeElection)
  }

  public componentWillUnount = /* istanbul ignore next */ () => {
    Mousetrap.unbind(removeElectionShortcuts)
  }

  public getElection = () => {
    const election = window.localStorage.getItem(electionKey)
    return election ? JSON.parse(election) : undefined
  }

  public setElection = (election: Election) => {
    this.setState({ election })
    window.localStorage.setItem(electionKey, JSON.stringify(election))
  }

  public removeElection = /* istanbul ignore next */ () => {
    window.localStorage.removeItem(electionKey)
    this.setState({
      election: undefined,
    })
  }

  public updateVote = (contestId: string, vote: Vote) => {
    this.setState(prevState => ({
      votes: Object.assign({}, prevState.votes, { [contestId]: vote }),
    }))
  }

  public resetVotes = () => {
    this.setState({
      votes: {},
    })
  }

  public render() {
    if (!this.state.election) {
      return <UploadConfig setElection={this.setElection} />
    } else {
      const { contests } = this.state.election
      return (
        <BallotContext.Provider
          value={{
            contests,
            resetVotes: this.resetVotes,
            updateVote: this.updateVote,
            votes: this.state.votes,
          }}
        >
          <BrowserRouter>
            <Ballot />
          </BrowserRouter>
        </BallotContext.Provider>
      )
    }
  }
}

export default App
