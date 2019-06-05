import React, { useContext, useEffect } from 'react'

import { Election } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const IdlePage = () => {
  const { election: e, markVoterCardUsed, resetBallot } = useContext(
    BallotContext
  )
  const election = e as Election
  const { title, state, county, date } = election

  const clearCardTimeout = window.setTimeout(async () => {
    await markVoterCardUsed(false)
    resetBallot('/')
  }, 5 * 1000)

  useEffect(() => {
    return function cleanCardTimeout() {
      window.clearTimeout(clearCardTimeout)
    }
  })

  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1 aria-label={`${title}.`}>{title}</h1>
          <p aria-hidden="true">
            {date}
            <br />
            {county.name}, {state}
          </p>
          <hr />
          <h2>
            This voting station has been inactive for a little bit.
            <br />
            To protect your privacy, this ballot will be cleared in 30 seconds
            unless you tap the screen.
          </h2>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default IdlePage
