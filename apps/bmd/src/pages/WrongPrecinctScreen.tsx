import React, { useEffect } from 'react'

import { Main, MainChild } from '@votingworks/ui'

import Prose from '../components/Prose'
import Screen from '../components/Screen'

interface Props {
  useEffectToggleLargeDisplay: () => void
}

const WrongPrecinctScreen: React.FC<Props> = ({
  useEffectToggleLargeDisplay,
}: Props) => {
  useEffect(useEffectToggleLargeDisplay, [])

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Invalid Card Data</h1>
            <p>Card is not configured for this precinct.</p>
            <p>Please ask poll worker for assistance.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default WrongPrecinctScreen
