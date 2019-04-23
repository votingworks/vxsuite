import React, { useContext } from 'react'
import { Redirect, Route, Switch } from 'react-router-dom'

import BallotContext from '../contexts/ballotContext'

import ActivationPage from '../pages/ActivationPage'
import CastBallotPage from '../pages/CastBallotPage'
import ContestPage from '../pages/ContestPage'
import HelpPage from '../pages/HelpPage'
import NotFoundPage from '../pages/NotFoundPage'
import PreReviewPage from '../pages/PreReviewPage'
import PrintPage from '../pages/PrintPage'
import ReviewPage from '../pages/ReviewPage'
import SettingsPage from '../pages/SettingsPage'
import StartPage from '../pages/StartPage'

const Ballot = () => {
  const { election } = useContext(BallotContext)
  const { bmdConfig, contests } = election!
  const { requireActivation, showHelpPage, showSettingsPage } = bmdConfig!
  return (
    <Switch>
      {requireActivation ? (
        <Route exact path="/" component={ActivationPage} />
      ) : (
        <Redirect exact path="/" to="/start" />
      )}
      <Route exact path="/activate" component={ActivationPage} />
      <Route path="/cast" component={CastBallotPage} />
      <Route path="/start" exact component={StartPage} />
      {contests.length && (
        <Redirect exact from="/contests" to={`/contests/${contests[0].id}`} />
      )}
      <Route path="/contests/:id" component={ContestPage} />
      <Route path="/pre-review" component={PreReviewPage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/print" component={PrintPage} />
      {showHelpPage && <Route path="/help" component={HelpPage} />}
      {showSettingsPage && <Route path="/settings" component={SettingsPage} />}
      <Route path="/:path" component={NotFoundPage} />
    </Switch>
  )
}

export default Ballot
