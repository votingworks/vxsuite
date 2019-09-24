import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

const ExpiredCardScreen = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Expired Card</h1>
          <p>Please see poll worker for assistance.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default ExpiredCardScreen
