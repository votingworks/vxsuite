import React, { useContext } from 'react'
import { Redirect, Route, Switch } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import Screen from '../components/Screen'
import ActivationPage from '../pages/ActivationPage'
import ContestPage from '../pages/ContestPage'
import HelpPage from '../pages/HelpPage'
import ReviewPage from '../pages/ReviewPage'
import SettingsPage from '../pages/SettingsPage'
import StartPage from '../pages/StartPage'

const Ballot = () => {
  const { contests } = useContext(BallotContext)
  return (
    <Screen>
      <Switch>
        <Route path="/" exact component={ActivationPage} />
        <Route path="/start" exact component={StartPage} />
        {contests.length && (
          <Redirect exact from="/contests" to={`/contests/${contests[0].id}`} />
        )}
        <Route path="/contests/:id" component={ContestPage} />
        <Route path="/review" component={ReviewPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/settings" component={SettingsPage} />
      </Switch>
    </Screen>
  )
}

export default Ballot
