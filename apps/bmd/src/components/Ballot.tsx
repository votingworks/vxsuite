import React, { useState } from 'react'
import { Route, Switch } from 'react-router-dom'
import IdleTimer from 'react-idle-timer'

import ContestPage from '../pages/ContestPage'
import IdlePage from '../pages/IdlePage'
import NotFoundPage from '../pages/NotFoundPage'
import PrintPage from '../pages/PrintPage'
import ReviewPage from '../pages/ReviewPage'
import StartPage from '../pages/StartPage'
import RemoveCardScreen from '../pages/RemoveCardScreen'
import CastBallotPage from '../pages/CastBallotPage'
import { IDLE_TIMEOUT_SECONDS } from '../config/globals'

const Ballot = () => {
  const [isIdle, setIsIdle] = useState(false)

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
      timeout={IDLE_TIMEOUT_SECONDS * 1000}
    >
      {isIdle ? (
        <IdlePage />
      ) : (
        <Switch>
          <Route path="/" exact component={StartPage} />
          <Route path="/contests/:contestNumber" component={ContestPage} />
          <Route path="/review" component={ReviewPage} />
          <Route path="/remove" component={RemoveCardScreen} />
          <Route path="/print" component={PrintPage} />
          <Route path="/cast" component={CastBallotPage} />
          <Route path="/:path" component={NotFoundPage} />
        </Switch>
      )}
    </IdleTimer>
  )
}

export default Ballot
