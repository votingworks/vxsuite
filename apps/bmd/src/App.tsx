import React from 'react'
import { BrowserRouter } from 'react-router-dom'

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

const initialState = {
  election: undefined,
  votes: {},
}

class App extends React.Component<{}, State> {
  public state: State = initialState

  public componentWillMount = () => {
    if (window.location.hash === '#sample') {
      this.setState({
        election: sampleElection,
      })
    }
  }

  public resetBallot = () => {
    this.setState({
      votes: {},
    })
  }

  public updateVote = (contestId: string, vote: Vote) => {
    this.setState(prevState => ({
      votes: Object.assign({}, prevState.votes, { [contestId]: vote }),
    }))
  }

  public setElection = (election: Election) => {
    this.setState({ election })
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
            resetBallot: this.resetBallot,
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
