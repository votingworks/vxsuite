import React, { useContext } from 'react'
import { Redirect, Route, Switch } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import Screen from '../components/Screen'
import ContestPage from '../pages/ContestPage'
import StartPage from '../pages/StartPage'
import SummaryPage from '../pages/SummaryPage'

const Ballot = () => {
  const { contests } = useContext(BallotContext)
  return (
    <Screen>
      <Switch>
        <Route path="/" exact component={StartPage} />
        {contests.length && (
          <Redirect exact from="/contests" to={`/contests/${contests[0].id}`} />
        )}
        <Route path="/contests/:id" component={ContestPage} />
        <Route path="/summary" component={SummaryPage} />
      </Switch>
    </Screen>
  )
}

export default Ballot
