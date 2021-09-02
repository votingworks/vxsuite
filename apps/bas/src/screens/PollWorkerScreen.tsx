import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Button from '../components/Button'

interface Props {
  lockScreen: () => void
}

const PollWorkerScreen = ({ lockScreen }: Props): JSX.Element => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Screen Unlocked</h1>
          <p>Remove Poll Worker card to continue.</p>
        </Prose>
      </MainChild>
    </Main>
    <MainNav>
      <Button small onPress={lockScreen}>
        Lock
      </Button>
    </MainNav>
  </Screen>
)

export default PollWorkerScreen
