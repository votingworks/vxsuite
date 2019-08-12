import React, { useContext, useState } from 'react'
import { Redirect, Route, Switch } from 'react-router-dom'
import IdleTimer from 'react-idle-timer'

import BallotContext from '../contexts/ballotContext'

import ContestPage from '../pages/ContestPage'
import IdlePage from '../pages/IdlePage'
import NotFoundPage from '../pages/NotFoundPage'
import PreReviewPage from '../pages/PreReviewPage'
import PrintPage from '../pages/PrintPage'
import ReviewPage from '../pages/ReviewPage'
import SettingsPage from '../pages/SettingsPage'
import StartPage from '../pages/StartPage'
import InstructionsPage from '../pages/InstructionsPage'

const Ballot = () => {
  const [isIdle, setIsIdle] = useState(false)

  const { contests, election } = useContext(BallotContext)
  const { showSettingsPage } = election!.bmdConfig!

  const onActive = () => {
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      setIsIdle(false)
    }, 200)
  }

  const onIdle = () => {
    setIsIdle(true)
  }

  return (
    <IdleTimer
      element={document}
      onActive={onActive}
      onIdle={onIdle}
      debounce={250}
      timeout={60 * 1000}
    >
      {isIdle ? (
        <IdlePage />
      ) : (
        <Switch>
          <Route path="/" exact component={StartPage} />
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
          {showSettingsPage && (
            <Route path="/settings" component={SettingsPage} />
          )}
          <Route path="/:path" component={NotFoundPage} />
        </Switch>
      )}
    </IdleTimer>
  )
}

export default Ballot
