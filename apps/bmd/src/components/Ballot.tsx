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
import InstructionsPage from '../pages/InstructionsPage'

const Ballot = () => {
  const { ballotStyleId, contests, election, precinctId } = useContext(
    BallotContext
  )
  const {
    requireActivation,
    showHelpPage,
    showSettingsPage,
  } = election!.bmdConfig!
  const ballotActivated = !!ballotStyleId && !!precinctId

  return (
    <Switch>
      {requireActivation && !ballotActivated ? (
        <Route exact path="/" component={ActivationPage} />
      ) : (
        <Redirect exact path="/" to="/start" />
      )}
      <Route exact path="/activate" component={ActivationPage} />
      <Route path="/cast" component={CastBallotPage} />
      <Route path="/start" exact component={StartPage} />
      <Route path="/instructions" exact component={InstructionsPage} />
      <Redirect
        exact
        from="/contests"
        to={contests.length ? '/contests/0' : '/'}
      />
      <Route path="/contests/:contestNumber" component={ContestPage} />
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
