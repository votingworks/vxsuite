import React, {
  useContext,
  useEffect,
  useState,
  PointerEventHandler,
} from 'react'
import pluralize from 'pluralize'

import useInterval from '../hooks/useInterval'

import BallotContext from '../contexts/ballotContext'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'

const timeoutSeconds = 30

const IdlePage = () => {
  const { election: e, markVoterCardUsed, resetBallot } = useContext(
    BallotContext
  )
  const election = e!
  const [countdown, setCountdown] = useState(timeoutSeconds)
  const { title } = election

  const onPress: PointerEventHandler = () => {}

  useEffect(() => {
    const reset = async () => {
      await markVoterCardUsed({ ballotPrinted: false })
      resetBallot()
    }
    countdown === 0 && reset()
  }, [countdown, markVoterCardUsed, resetBallot])

  useInterval(() => {
    setCountdown(t => t - 1)
  }, 1000)

  return (
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1 aria-label={`${title}.`}>{title}</h1>
          <hr />
          <p>This voting station has been inactive for more than one minute.</p>
          <p>
            To protect your privacy, this ballot will be cleared in{' '}
            <strong>{pluralize('second', countdown, true)}</strong>.
          </p>
          <Button primary onPress={onPress}>
            Touch the screen to go back to the ballot.
          </Button>
        </Prose>
      </MainChild>
    </Main>
  )
}

export default IdlePage
