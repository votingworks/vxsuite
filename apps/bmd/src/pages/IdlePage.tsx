import React, { useContext, useEffect } from 'react'

import { Election } from '../config/types'

import BallotContext from '../contexts/ballotContext'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const timeoutSeconds = 30

const IdlePage = () => {
  const { election: e, markVoterCardUsed, resetBallot } = useContext(
    BallotContext
  )
  const election = e as Election
  const { title } = election

  useEffect(() => {
    const clearCardTimeout = window.setTimeout(async () => {
      await markVoterCardUsed({ ballotPrinted: false })
      resetBallot('/')
    }, timeoutSeconds * 1000)

    return function cleanCardTimeout() {
      window.clearTimeout(clearCardTimeout)
    }
  })

  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1 aria-label={`${title}.`}>{title}</h1>
          <hr />
          <h2>
            This voting station has been inactive for a little bit.
            <br />
            To protect your privacy, this ballot will be cleared in{' '}
            {timeoutSeconds} seconds unless you tap the screen.
          </h2>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default IdlePage
