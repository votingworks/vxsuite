import React from 'react'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

const WritingCardScreen = () => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Programming Card…</h1>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default WritingCardScreen
