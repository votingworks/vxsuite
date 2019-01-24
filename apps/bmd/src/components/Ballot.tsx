import React, { useContext } from 'react'
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import Screen from '../components/Screen'
import ContestPage from '../pages/ContestPage'
import StartPage from '../pages/StartPage'
import SummaryPage from '../pages/SummaryPage'

const Ballot = () => {
  const { contests } = useContext(BallotContext)
  return (
    <BrowserRouter>
      <Screen>
        <Switch>
          <Route path="/" exact component={StartPage} />
          <Redirect exact from="/contests" to={`/contests/${contests[0].id}`} />
          <Route path="/contests/:id" component={ContestPage} />
          <Route path="/summary" component={SummaryPage} />
        </Switch>
      </Screen>
    </BrowserRouter>
  )
}

export default Ballot
