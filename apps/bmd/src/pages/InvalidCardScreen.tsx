import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

const InvalidCardScreen = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Invalid Card</h1>
          <p>Card is not configured for this precinct.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default InvalidCardScreen
