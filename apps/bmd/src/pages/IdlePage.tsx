import React, { useContext, useEffect, useState } from 'react'
import pluralize from 'pluralize'
import useInterval from 'use-interval'

import { Button } from '@votingworks/ui'

import {
  IDLE_RESET_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_SECONDS,
} from '../config/globals'

import BallotContext from '../contexts/ballotContext'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Loading from '../components/Loading'
import Screen from '../components/Screen'
import { EventTargetFunction } from '../config/types'

const timeoutSeconds = IDLE_RESET_TIMEOUT_SECONDS

const IdlePage: React.FC = () => {
  const { markVoterCardVoided, resetBallot } = useContext(BallotContext)
  const [countdown, setCountdown] = useState(timeoutSeconds)
  const [isLoading, setIsLoading] = useState(false)

  const onPress: EventTargetFunction = () => {
    // do nothing
  }

  useEffect(() => {
    const reset = async () => {
      setIsLoading(true)
      await markVoterCardVoided()
      resetBallot()
    }
    if (countdown === 0) void reset()
  }, [countdown, markVoterCardVoided, resetBallot])

  useInterval(() => {
    setCountdown((previous) => previous - 1)
  }, 1000)

  return (
    <Screen>
      <Main>
        <MainChild center>
          {isLoading ? (
            <Loading>Clearing ballot</Loading>
          ) : (
            <Prose textCenter>
              <h1 aria-label="Are you still voting?">Are you still voting?</h1>
              <p>
                This voting station has been inactive for more than{' '}
                {pluralize('minute', IDLE_TIMEOUT_SECONDS / 60, true)}.
              </p>
              {countdown <= timeoutSeconds / 2 && (
                <p>
                  To protect your privacy, this ballot will be cleared in{' '}
                  <strong>{pluralize('second', countdown, true)}</strong>.
                </p>
              )}
              <Button primary onPress={onPress}>
                Yes, I’m still voting.
              </Button>
            </Prose>
          )}
        </MainChild>
      </Main>
    </Screen>
  )
}

export default IdlePage
