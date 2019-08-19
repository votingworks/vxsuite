import React, {
  useContext,
  useEffect,
  useState,
  PointerEventHandler,
} from 'react'
import pluralize from 'pluralize'

import useInterval from 'use-interval'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Loading from '../components/Loading'

const timeoutSeconds = 30

const IdlePage = () => {
  const { election: e, markVoterCardUsed, resetBallot } = useContext(
    BallotContext
  )
  const election = e!
  const [countdown, setCountdown] = useState(timeoutSeconds)
  const [isLoading, setIsLoading] = useState(false)
  const { title } = election

  const onPress: PointerEventHandler = () => {}

  useEffect(() => {
    const reset = () => {
      setIsLoading(true)
      markVoterCardUsed({ ballotPrinted: false }).then(() => {
        resetBallot()
      })
    }
    countdown === 0 && reset()
  }, [countdown, markVoterCardUsed, resetBallot])

  useInterval(() => {
    setCountdown(t => (t > 0 ? t - 1 : 0))
  }, 1000)

  return (
    <Main>
      <MainChild center>
        {isLoading ? (
          <Loading>Clearing ballot</Loading>
        ) : (
          <Prose textCenter>
            <h1 aria-label={`${title}.`}>{title}</h1>
            <hr />
            <p>
              This voting station has been inactive for more than one minute.
            </p>
            <p>
              To protect your privacy, this ballot will be cleared in{' '}
              <strong>{pluralize('second', countdown, true)}</strong>.
            </p>
            <Button primary onPress={onPress}>
              Touch the screen to go back to the ballot.
            </Button>
          </Prose>
        )}
      </MainChild>
    </Main>
  )
}

export default IdlePage
