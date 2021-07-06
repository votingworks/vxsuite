import React, { useEffect } from 'react'

import { Main, MainChild } from '@votingworks/ui'

import Prose from '../components/Prose'
import Screen from '../components/Screen'

interface Props {
  useEffectToggleLargeDisplay: () => void
}

const UsedCardScreen: React.FC<Props> = ({
  useEffectToggleLargeDisplay,
}: Props) => {
  useEffect(useEffectToggleLargeDisplay, [])

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Used Card</h1>
            <p>Please return card to a poll worker.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default UsedCardScreen
