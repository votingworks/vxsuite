import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

const WrongElectionScreen = () => (
  <Screen white>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Invalid Card Data</h1>
          <p>Card is not configured for this election.</p>
          <p>Please ask poll worker for assistance.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default WrongElectionScreen
