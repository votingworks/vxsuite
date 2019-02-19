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

export const electionKey = 'votingWorksElection'

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
    } else {
      this.setState({
        election: this.getElection(),
      })
    }
  }

  public getElection = () => {
    const election = window.localStorage.getItem(electionKey)
    return election ? JSON.parse(election) : undefined
  }

  public setElection = (election: Election) => {
    this.setState({ election })
    window.localStorage.setItem(electionKey, JSON.stringify(election))
  }

  public resetVotes = () => {
    this.setState({
      votes: {},
    })
  }

  public updateVote = (contestId: string, vote: Vote) => {
    this.setState(prevState => ({
      votes: Object.assign({}, prevState.votes, { [contestId]: vote }),
    }))
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
