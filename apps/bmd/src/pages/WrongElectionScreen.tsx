import React, { useEffect } from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

interface Props {
  useEffectToggleLargeDisplay: () => void
  isVoterCard: boolean
}

const WrongElectionScreen: React.FC<Props> = ({
  useEffectToggleLargeDisplay,
  isVoterCard,
}: Props) => {
  useEffect(useEffectToggleLargeDisplay, [])

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Invalid Card Data</h1>
            <p>Card is not configured for this election.</p>
            <p>
              Please ask {isVoterCard ? 'poll worker' : 'admin'} for assistance.
            </p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default WrongElectionScreen
