import React from 'react'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

const UsedCardScreen = () => (
  <Screen>
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

export default UsedCardScreen
