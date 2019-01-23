import React from 'react'
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom'
import styled from 'styled-components'

import './App.css'

import { Election, Vote, VoteDict } from './config/types'
import BallotContext from './contexts/ballotContext'
import ContestPage from './pages/ContestPage'
import StartPage from './pages/StartPage'
import SummaryPage from './pages/SummaryPage'

interface Props {
  election: Election
}

interface State {
  votes: VoteDict
}

const initialState = {
  votes: {},
}

class App extends React.Component<Props, State> {
  public initialWindowHistoryLength =
    window.location.pathname === '/' ? window.history.length : 0

  constructor(props: Props) {
    super(props)
    this.state = initialState
  }

  public resetBallot = () => {
    this.setState(initialState)
    window.history.go(
      -(window.history.length - this.initialWindowHistoryLength)
    )
  }

  public updateVote = (contestId: string, vote: Vote) => {
    this.setState(prevState => ({
      votes: Object.assign({}, prevState.votes, { [contestId]: vote }),
    }))
  }

  public render() {
    const { contests } = this.props.election
    return (
      <BrowserRouter>
        <BallotContext.Provider
          value={{
            contests,
            resetBallot: this.resetBallot,
            updateVote: this.updateVote,
            votes: this.state.votes,
          }}
        >
          <Screen>
            <Switch>
              <Route path="/" exact component={StartPage} />
              <Redirect
                exact
                from="/contests"
                to={`/contests/${contests[0].id}`}
              />
              <Route path="/contests/:id" component={ContestPage} />
              <Route path="/summary" component={SummaryPage} />
            </Switch>
          </Screen>
        </BallotContext.Provider>
      </BrowserRouter>
    )
  }
}

export default App
