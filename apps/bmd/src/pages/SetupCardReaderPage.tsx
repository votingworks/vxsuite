import React, { useEffect } from 'react'
import { Main, MainChild } from '@votingworks/ui'

import Prose from '../components/Prose'
import Screen from '../components/Screen'

interface Props {
  useEffectToggleLargeDisplay: () => void
}

const SetupCardReaderPage: React.FC<Props> = ({
  useEffectToggleLargeDisplay,
}: Props) => {
  useEffect(useEffectToggleLargeDisplay, [])

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Card Reader Not Detected</h1>
            <p>Please ask a poll worker to connect card reader.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default SetupCardReaderPage
