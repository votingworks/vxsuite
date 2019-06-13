import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'

const PollWorkerScreen = () => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Screen Unlocked</h1>
            <p>Remove Poll Worker card to continue.</p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav title="Poll Worker" />
    </Screen>
  )
}

export default PollWorkerScreen
