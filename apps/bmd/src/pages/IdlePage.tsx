import React, {
  useContext,
  useEffect,
  useState,
  PointerEventHandler,
} from 'react'
import pluralize from 'pluralize'
import useInterval from 'use-interval'

import {
  IDLE_RESET_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_SECONDS,
} from '../config/globals'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Loading from '../components/Loading'
import Screen from '../components/Screen'

const timeoutSeconds = IDLE_RESET_TIMEOUT_SECONDS

const IdlePage = () => {
  const { markVoterCardVoided, resetBallot } = useContext(BallotContext)
  const [countdown, setCountdown] = useState(timeoutSeconds)
  const [isLoading, setIsLoading] = useState(false)

  const onPress: PointerEventHandler = () => {
    // do nothing
  }

  useEffect(() => {
    const reset = async () => {
      setIsLoading(true)
      await markVoterCardVoided()
      resetBallot()
    }
    countdown === 0 && reset()
  }, [countdown, markVoterCardVoided, resetBallot])

  useInterval(() => {
    setCountdown((countdown) => countdown - 1)
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
