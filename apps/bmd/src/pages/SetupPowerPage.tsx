import React, { useEffect } from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'
import { NoWrap } from '../components/Text'

interface Props {
  useEffectToggleLargeDisplay: () => void
}

const SetupPowerPage: React.FC<Props> = ({
  useEffectToggleLargeDisplay,
}: Props) => {
  useEffect(useEffectToggleLargeDisplay, [])

  return (
    <Screen white>
      <Main padded>
        <MainChild center>
          <Prose textCenter>
            <h1>
              No Power Detected <NoWrap>and Battery is Low</NoWrap>
            </h1>
            <p>
              Please ask a poll worker to plug-in the power cord for this
              machine.
            </p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default SetupPowerPage
