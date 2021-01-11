import React, { useEffect } from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
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
