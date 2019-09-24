import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

const UnconfiguredScreen = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Device Not Configured</h1>
          <p>Insert Election Admin card.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default UnconfiguredScreen
