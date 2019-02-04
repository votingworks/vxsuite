import React from 'react'

import './App.css'
import { Election, OptionalElection, Vote, VoteDict } from './config/types'

import Ballot from './components/Ballot'
import BallotContext from './contexts/ballotContext'
import ConfigPage from './pages/ConfigPage'

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
      return <ConfigPage setElection={this.setElection} />
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
          <Ballot />
        </BallotContext.Provider>
      )
    }
  }
}

export default App
